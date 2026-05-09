"""
QuerySense — API Routes
FastAPI endpoints for the NL-to-SQL pipeline with analytics.
"""

import logging
import math
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.schemas import (
    QueryRequest,
    ClarificationAnswer,
    QueryResponse,
    SchemaStatusResponse,
    TableInfo,
    ColumnInfo,
    HistoryEntry,
    AnalyticsResponse,
)
from app.core.pipeline import QueryPipeline
from app.core.schema_manager import schema_manager
from app.db.database import db_manager
from app.llm.provider import LLMProvider, get_provider
from app.config import settings
from datetime import datetime
from typing import List, Optional, Dict

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# ── State ──
_pipeline: QueryPipeline = None
_llm: LLMProvider = None
_history: List[dict] = []
_history_counter = 0


def init_pipeline(pipeline: QueryPipeline):
    """Initialize the router with the pipeline instance."""
    global _pipeline
    _pipeline = pipeline


def set_llm_provider(llm: LLMProvider):
    """Store a reference to the current LLM provider."""
    global _llm
    _llm = llm


# ── Main Query Endpoint ──

@router.post("/query", response_model=QueryResponse)
async def submit_query(request: QueryRequest):
    """
    Translate a natural language query to SQL and execute it.
    
    Pipeline stages:
    1. Schema drift check
    2. Ambiguity scoring
    3. SQL generation via LLM
    4. SQL validation
    5. Execution + self-correction
    """
    global _history_counter

    if not _pipeline:
        raise HTTPException(status_code=500, detail="Pipeline not initialized")

    if not request.query or len(request.query.strip()) < 3:
        raise HTTPException(status_code=400, detail="Query must be at least 3 characters")

    logger.info(f"Processing query: '{request.query[:80]}'")

    try:
        result = _pipeline.process_query(
            query=request.query,
            db_id=request.db_id,
        )
    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

    # Record in history with enriched data
    _history_counter += 1
    _history.append({
        "id": _history_counter,
        "query": request.query,
        "sql": result.sql,
        "success": result.success,
        "corrections": result.corrections,
        "query_type": result.query_type,
        "tables_used": result.tables_used,
        "execution_time_ms": result.execution_time_ms,
        "error": result.error,
        "timestamp": datetime.utcnow().isoformat(),
    })

    # Keep history bounded
    if len(_history) > 100:
        _history.pop(0)

    logger.info(f"Query result: success={result.success}, corrections={result.corrections}, type={result.query_type}")
    return result


@router.post("/query/clarify", response_model=QueryResponse)
async def submit_clarification(answer: ClarificationAnswer):
    """Submit a clarified query after ambiguity was detected."""
    if not _pipeline:
        raise HTTPException(status_code=500, detail="Pipeline not initialized")

    logger.info(f"Processing clarification for: '{answer.original_query[:60]}'")

    try:
        result = _pipeline.process_query(
            query=answer.original_query,
            db_id=answer.db_id,
            skip_ambiguity_check=True,
            clarifications=answer.clarification,
        )
    except Exception as e:
        logger.error(f"Clarification pipeline error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

    return result


# ── Config Endpoints (Runtime LLM Switching) ──
class ProviderSwitchRequest(BaseModel):
    provider: str  # "mock", "openai", "anthropic", or "groq"
    api_key: Optional[str] = None

@router.get("/config")
async def get_config():
    """Get current system config including LLM provider."""
    available_providers = ["mock", "openai", "anthropic", "groq"]

    return {
        "current_provider": _llm.name if _llm else "unknown",
        "provider_id": settings.LLM_PROVIDER,
        "available_providers": available_providers,
        "max_retries": settings.MAX_RETRIES,
        "ambiguity_threshold": settings.AMBIGUITY_THRESHOLD,
    }


@router.post("/config/provider")
async def switch_provider(request: ProviderSwitchRequest):
    """Switch the LLM provider at runtime without restarting."""
    global _pipeline, _llm

    provider_name = request.provider.lower()
    logger.info(f"Switching LLM provider to: {provider_name}")

    try:
        api_key = request.api_key
        if not api_key:
            if provider_name == "openai":
                api_key = settings.OPENAI_API_KEY
            elif provider_name == "anthropic":
                api_key = settings.ANTHROPIC_API_KEY
            elif provider_name == "groq":
                api_key = getattr(settings, "GROQ_API_KEY", None)

        if provider_name in ("openai", "anthropic", "groq") and not api_key:
            raise HTTPException(
                status_code=400,
                detail=f"API key required for {provider_name}. Set it in .env or provide in request."
            )

        new_llm = get_provider(
            provider_name,
            api_key=api_key,
            model=settings.default_model,
        )

        # Replace pipeline with new provider
        _llm = new_llm
        _pipeline = QueryPipeline(new_llm)

        # Update settings reference
        settings.LLM_PROVIDER = provider_name

        logger.info(f"LLM provider switched to: {new_llm.name}")
        return {
            "status": "switched",
            "provider": new_llm.name,
            "provider_id": provider_name,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Provider switch failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to switch provider: {str(e)}")


# ── Schema Endpoints ──

@router.get("/schema/status")
async def get_schema_status(db_id: str = "sales_db"):
    """Check the current schema drift status."""
    if not db_manager.is_registered(db_id):
        raise HTTPException(status_code=404, detail=f"Database '{db_id}' not found")

    engine = db_manager.get_engine(db_id)
    drift_detected, changes = schema_manager.check_drift(db_id, engine)
    baseline = schema_manager.get_baseline(db_id)

    if drift_detected:
        logger.warning(f"Schema drift detected for {db_id}: {changes}")

    return SchemaStatusResponse(
        db_id=db_id,
        status="drifted" if drift_detected else "ok",
        current_hash=schema_manager.compute_schema_hash(
            schema_manager.introspect_schema(engine)
        ),
        baseline_hash=baseline["hash"] if baseline else None,
        changes=changes,
        last_checked=datetime.utcnow().isoformat(),
    )


@router.post("/schema/refresh")
async def refresh_schema(db_id: str = "sales_db"):
    """Force re-introspection and update the baseline hash."""
    if not db_manager.is_registered(db_id):
        raise HTTPException(status_code=404, detail=f"Database '{db_id}' not found")

    engine = db_manager.get_engine(db_id)
    result = schema_manager.refresh_baseline(db_id, engine)

    logger.info(f"Schema refreshed for {db_id}: {result['hash']}")
    
    return {
        "status": "refreshed",
        "db_id": db_id,
        "new_hash": result["hash"],
        "tables": result["tables"],
        "timestamp": result["timestamp"],
    }


@router.get("/schema/tables")
async def get_schema_tables(db_id: str = "sales_db"):
    """Get table and column info for UI display."""
    if not db_manager.is_registered(db_id):
        raise HTTPException(status_code=404, detail=f"Database '{db_id}' not found")

    engine = db_manager.get_engine(db_id)
    tables = schema_manager.get_schema_tables_info(engine)
    return {"db_id": db_id, "tables": tables}


# ── History ──

@router.get("/history")
async def get_query_history():
    """Get recent query history."""
    return {"history": list(reversed(_history[-20:]))}


# ── Analytics ──

@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics():
    """
    Get system analytics computed from real query history.
    All metrics reflect actual system behavior — nothing is faked.
    """
    if not _history:
        return AnalyticsResponse()

    total = len(_history)
    successes = sum(1 for h in _history if h["success"])
    total_corrections = sum(h.get("corrections", 0) for h in _history)
    queries_with_corrections = sum(1 for h in _history if h.get("corrections", 0) > 0)
    successful_corrections = sum(1 for h in _history if h.get("corrections", 0) > 0 and h["success"])
    
    exec_times = [h["execution_time_ms"] for h in _history if h.get("execution_time_ms")]
    avg_exec_time = round(sum(exec_times) / len(exec_times), 2) if exec_times else 0.0
    
    success_rate = round((successes / total) * 100, 1) if total > 0 else 0.0
    correction_rate = round((successful_corrections / total) * 100, 1) if total > 0 else 0.0
    avg_corrections = round(total_corrections / total, 2) if total > 0 else 0.0

    # Query type breakdown
    type_counts: Dict[str, int] = {
        "aggregation": 0,
        "join": 0,
        "filter": 0,
        "sorting": 0,
        "simple": 0
    }
    for h in _history:
        qt = h.get("query_type")
        if not qt or qt not in type_counts:
            qt = "simple"
        type_counts[qt] += 1
    
    most_common_type = "simple"
    max_count = -1
    for qt, count in type_counts.items():
        if count > max_count:
            max_count = count
            most_common_type = qt

    # Correction distribution
    corr_dist: Dict[str, int] = {"0": 0, "1": 0, "2": 0, "3+": 0}
    for h in _history:
        c = h.get("corrections", 0)
        if c == 0:
            corr_dist["0"] += 1
        elif c == 1:
            corr_dist["1"] += 1
        elif c == 2:
            corr_dist["2"] += 1
        else:
            corr_dist["3+"] += 1

    # Most used tables
    table_counts: Dict[str, int] = {}
    for h in _history:
        for t in (h.get("tables_used") or []):
            table_counts[t] = table_counts.get(t, 0) + 1

    # Most failed queries
    failed = [
        {"query": h["query"], "error": h.get("error", ""), "timestamp": h["timestamp"]}
        for h in _history if not h["success"]
    ][-5:]  # Last 5 failures

    # Queries that triggered corrections
    corrected = [
        {
            "query": h["query"],
            "corrections": h.get("corrections", 0),
            "success": h["success"],
            "timestamp": h["timestamp"],
        }
        for h in _history if h.get("corrections", 0) > 0
    ][-5:]  # Last 5

    # System Intelligence Score — weighted composite metric
    # ── 60% from Success Rate (core reliability) ──
    success_component = (success_rate / 100) * 60

    # ── 25% from Self-Healing Ability ──
    # Measures: of queries that NEEDED correction, how many succeeded?
    # This is the true self-healing ratio, not corrections/total.
    if queries_with_corrections > 0:
        healing_ratio = successful_corrections / queries_with_corrections
    else:
        healing_ratio = 1.0  # No corrections needed = perfect
    healing_component = healing_ratio * 25

    # ── 15% from Speed Efficiency ──
    # Uses logarithmic decay: fast queries score high, slow ones degrade gracefully
    # 0-500ms = full points, 500-5000ms = partial, 5000ms+ = near zero

    if avg_exec_time <= 500:
        speed_ratio = 1.0
    else:
        speed_ratio = max(0, 1 - math.log10(avg_exec_time / 500) / 2)
    speed_component = speed_ratio * 15

    intelligence_score = round(min(100, max(0, success_component + healing_component + speed_component)), 1)

    return AnalyticsResponse(
        total_queries=total,
        success_rate=success_rate,
        avg_execution_time=avg_exec_time,
        total_corrections=total_corrections,
        correction_rate=correction_rate,
        avg_corrections_per_query=avg_corrections,
        most_common_query_type=most_common_type,
        intelligence_score=intelligence_score,
        query_type_breakdown=type_counts,
        correction_distribution=corr_dist,
        execution_times=exec_times[-50:],  # Last 50
        most_used_tables=table_counts,
        most_failed_queries=failed,
        queries_with_corrections=corrected,
    )
