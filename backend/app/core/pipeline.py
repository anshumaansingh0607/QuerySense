"""
QuerySense — Pipeline Orchestrator
Wires all 5 stages together into a single query-processing flow.
Passes structured reasoning and classifies query types.
"""

import re
import time
import logging
from typing import Optional
from app.config import settings
from app.db.database import db_manager
from app.core.schema_manager import schema_manager
from app.core.ambiguity_scorer import AmbiguityScorer
from app.core.sql_generator import SQLGenerator
from app.core.sql_validator import SQLValidator
from app.core.execution_engine import ExecutionEngine, ExecutionResult
from app.core.self_corrector import SelfCorrector
from app.llm.provider import LLMProvider
from app.models.schemas import (
    QueryResponse, ClarificationNeeded,
    CorrectionStep as CorrectionStepSchema,
    StructuredReasoning, TableReason, ColumnReason,
    FilterInfo, JoinInfo, AggregationInfo, SortingInfo,
)

logger = logging.getLogger(__name__)


class QueryPipeline:
    """
    Orchestrates the full NL-to-SQL pipeline:
    
    1. Schema Manager — check for drift, build schema context
    2. Ambiguity Scorer — evaluate query clarity
    3. SQL Generator — translate NL to SQL via LLM
    4. SQL Validator — reject dangerous ops, basic syntax check
    5. Execution Engine — run SQL, capture errors
    6. Self-Corrector — retry with error context (up to N attempts)
    """

    def __init__(self, llm: LLMProvider):
        self._ambiguity_scorer = AmbiguityScorer(llm, threshold=settings.AMBIGUITY_THRESHOLD)
        self._sql_generator = SQLGenerator(llm)
        self._sql_validator = SQLValidator()
        self._execution_engine = ExecutionEngine()
        self._self_corrector = SelfCorrector(llm, max_retries=settings.MAX_RETRIES)
        self._llm = llm

    def process_query(
        self,
        query: str,
        db_id: str = "sales_db",
        skip_ambiguity_check: bool = False,
        clarifications: Optional[str] = None,
    ) -> QueryResponse:
        """
        Process a natural language query through the full pipeline.
        """
        start_time = time.time()
        logger.info(f"[Pipeline] Starting for query: '{query[:80]}'")

        # Validate database exists
        if not db_manager.is_registered(db_id):
            return QueryResponse(
                success=False,
                error=f"Database '{db_id}' is not registered.",
                execution_time_ms=self._elapsed(start_time),
            )

        engine = db_manager.get_engine(db_id)

        # ── Stage 1: Schema Drift Check ──
        logger.info("[Pipeline] Stage 1: Checking schema drift...")
        drift_detected, drift_changes = schema_manager.check_drift(db_id, engine)
        if drift_detected:
            logger.warning(f"[Pipeline] Schema drift detected: {drift_changes}")

        # Get current schema for prompt injection
        baseline = schema_manager.get_baseline(db_id)
        if not baseline:
            schema_manager.store_baseline(db_id, engine)
            baseline = schema_manager.get_baseline(db_id)

        # If drift detected, refresh the baseline so LLM uses current schema
        if drift_detected:
            schema_manager.refresh_baseline(db_id, engine)
            baseline = schema_manager.get_baseline(db_id)

        schema_context = schema_manager.format_schema_for_prompt(baseline["schema"])

        # Update validator with known table names
        self._sql_validator.update_known_tables(set(baseline["schema"].keys()))

        # ── Stage 2: Ambiguity Scoring ──
        logger.info("[Pipeline] Stage 2: Scoring query ambiguity...")
        ambiguity_score = None
        if not skip_ambiguity_check:
            ambiguity_result = self._ambiguity_scorer.score_query(query, schema_context)
            ambiguity_score = ambiguity_result["confidence_score"]
            logger.info(f"[Pipeline] Ambiguity score: {ambiguity_score}")

            if ambiguity_result["needs_clarification"]:
                logger.info("[Pipeline] Clarification needed, returning early.")
                return QueryResponse(
                    success=True,
                    ambiguity_score=ambiguity_score,
                    clarification=ClarificationNeeded(
                        needs_clarification=True,
                        question=ambiguity_result.get("clarification_question", "Could you provide more detail?"),
                        ambiguities=ambiguity_result.get("ambiguities", []),
                        confidence_score=ambiguity_score,
                    ),
                    drift_detected=drift_detected,
                    drift_changes=drift_changes,
                    execution_time_ms=self._elapsed(start_time),
                )

        # ── Stage 3: SQL Generation ──
        logger.info("[Pipeline] Stage 3: Generating SQL...")
        structured_reasoning = None
        try:
            gen_result = self._sql_generator.generate(query, schema_context, clarifications)
            sql = gen_result["sql"]
            explanation = gen_result["explanation"]
            tables_used = gen_result.get("tables_used", [])
            assumptions = gen_result.get("assumptions", [])
            raw_reasoning = gen_result.get("reasoning", {})
            
            # Build StructuredReasoning from raw dict
            structured_reasoning = self._build_structured_reasoning(raw_reasoning)
            
            logger.info(f"[Pipeline] Generated SQL: {sql[:100]}")
        except Exception as e:
            logger.error(f"[Pipeline] SQL generation failed: {e}", exc_info=True)
            return QueryResponse(
                success=False,
                error=f"SQL generation failed: {str(e)}",
                ambiguity_score=ambiguity_score,
                drift_detected=drift_detected,
                drift_changes=drift_changes,
                execution_time_ms=self._elapsed(start_time),
            )

        # ── Classify Query Type ──
        query_type = self._classify_query_type(sql, query)

        # ── Stage 4: SQL Validation ──
        logger.info("[Pipeline] Stage 4: Validating SQL...")
        validation = self._sql_validator.validate(sql)
        if not validation.valid:
            logger.warning(f"[Pipeline] SQL validation failed: {validation.error}")
            return QueryResponse(
                success=False,
                sql=sql,
                error=f"SQL validation failed: {validation.error}",
                explanation=explanation,
                reasoning=structured_reasoning,
                query_type=query_type,
                ambiguity_score=ambiguity_score,
                drift_detected=drift_detected,
                drift_changes=drift_changes,
                execution_time_ms=self._elapsed(start_time),
            )
        if validation.warnings:
            logger.info(f"[Pipeline] SQL validation warnings: {validation.warnings}")

        # ── Stage 5: SQL Execution ──
        logger.info("[Pipeline] Stage 5: Executing SQL...")
        exec_result = self._execution_engine.execute(sql, engine)

        # ── Stage 6: Self-Correction Loop ──
        corrections = 0
        correction_history = []
        original_sql = sql  # Keep reference for diff view

        if not exec_result.success:
            logger.warning(f"[Pipeline] Execution failed: {exec_result.error}")
            logger.info("[Pipeline] Stage 6: Starting self-correction...")
            history = None
            current_sql = sql
            current_error = exec_result.error

            for attempt in range(settings.MAX_RETRIES):
                logger.info(f"[Pipeline] Self-correction attempt {attempt + 1}/{settings.MAX_RETRIES}")
                corrected_sql, corr_explanation, history = self._self_corrector.correct(
                    query=query,
                    failed_sql=current_sql,
                    error_msg=current_error,
                    schema_context=schema_context,
                    history=history if attempt > 0 else None,
                )

                corrections += 1

                if corrected_sql is None:
                    logger.warning(f"[Pipeline] Self-corrector stopped: {corr_explanation}")
                    break

                # Validate corrected SQL too
                corr_validation = self._sql_validator.validate(corrected_sql)
                if not corr_validation.valid:
                    logger.warning(f"[Pipeline] Corrected SQL failed validation: {corr_validation.error}")
                    current_sql = corrected_sql
                    current_error = corr_validation.error
                    continue

                # Try executing the corrected SQL
                exec_result = self._execution_engine.execute(corrected_sql, engine)
                
                if exec_result.success:
                    logger.info(f"[Pipeline] Self-correction succeeded on attempt {corrections}")
                    sql = corrected_sql
                    explanation = (
                        f"{explanation}\n\n"
                        f"**Self-Correction Applied** (attempt {corrections}): {corr_explanation}"
                    )
                    break
                else:
                    logger.warning(f"[Pipeline] Corrected SQL still failed: {exec_result.error}")
                    current_sql = corrected_sql
                    current_error = exec_result.error

            # Build correction history for response
            if history:
                correction_history = [
                    CorrectionStepSchema(
                        attempt=step.attempt,
                        sql=step.sql,
                        error=step.error,
                    )
                    for step in history
                ]

        elapsed = self._elapsed(start_time)
        logger.info(f"[Pipeline] Complete: success={exec_result.success}, corrections={corrections}, time={elapsed}ms")

        # ── Query Plan (EXPLAIN QUERY PLAN) ──
        query_plan = None
        if exec_result.success and sql:
            try:
                query_plan = self._execution_engine.explain(sql, engine)
            except Exception as e:
                logger.warning(f"[Pipeline] EXPLAIN QUERY PLAN failed: {e}")

        # ── Build Response ──
        return QueryResponse(
            success=exec_result.success,
            sql=sql,
            original_sql=original_sql if corrections > 0 else None,
            result=exec_result.data if exec_result.success else None,
            columns=exec_result.columns if exec_result.success else None,
            row_count=exec_result.row_count if exec_result.success else None,
            explanation=explanation,
            reasoning=structured_reasoning,
            tables_used=tables_used if tables_used else None,
            assumptions=assumptions if assumptions else None,
            query_type=query_type,
            corrections=corrections,
            correction_history=correction_history if correction_history else None,
            drift_detected=drift_detected,
            drift_changes=drift_changes,
            ambiguity_score=ambiguity_score,
            error=exec_result.error if not exec_result.success else None,
            execution_time_ms=elapsed,
            query_plan=query_plan,
        )

    def _build_structured_reasoning(self, raw: dict) -> Optional[StructuredReasoning]:
        """Convert raw reasoning dict from LLM into a StructuredReasoning model."""
        if not raw:
            return None
        
        try:
            tables = []
            for t in raw.get("tables_used", []):
                if isinstance(t, dict):
                    tables.append(TableReason(name=t.get("name", ""), reason=t.get("reason", "")))
                elif isinstance(t, str):
                    tables.append(TableReason(name=t, reason=""))

            columns = []
            for c in raw.get("columns_selected", []):
                if isinstance(c, dict):
                    columns.append(ColumnReason(name=c.get("name", ""), reason=c.get("reason", "")))
                elif isinstance(c, str):
                    columns.append(ColumnReason(name=c, reason=""))

            filters = []
            for f in raw.get("filters", []):
                if isinstance(f, dict):
                    filters.append(FilterInfo(condition=f.get("condition", ""), reason=f.get("reason", "")))

            joins = []
            for j in raw.get("joins", []):
                if isinstance(j, dict):
                    joins.append(JoinInfo(
                        tables=j.get("tables", ""),
                        condition=j.get("condition", ""),
                        type=j.get("type", "INNER JOIN"),
                        reason=j.get("reason", ""),
                    ))

            aggregations = []
            for a in raw.get("aggregations", []):
                if isinstance(a, dict):
                    aggregations.append(AggregationInfo(
                        function=a.get("function", ""),
                        column=a.get("column", ""),
                        alias=a.get("alias"),
                        reason=a.get("reason", ""),
                    ))

            sorting = []
            for s in raw.get("sorting", []):
                if isinstance(s, dict):
                    sorting.append(SortingInfo(
                        column=s.get("column", ""),
                        direction=s.get("direction", "ASC"),
                        reason=s.get("reason", ""),
                    ))

            return StructuredReasoning(
                intent=raw.get("intent", ""),
                tables_used=tables,
                columns_selected=columns,
                filters=filters,
                joins=joins,
                aggregations=aggregations,
                sorting=sorting,
                assumptions=raw.get("assumptions", []),
            )
        except Exception as e:
            logger.warning(f"[Pipeline] Failed to build structured reasoning: {e}")
            return None

    def _classify_query_type(self, sql: str, query: str) -> str:
        """Classify the query type based on SQL content."""
        if not sql or not isinstance(sql, str):
            return "simple"
            
        normalized_sql = re.sub(r'\s+', ' ', sql.upper())
        
        if ' JOIN ' in normalized_sql or ' INNER JOIN ' in normalized_sql or ' LEFT JOIN ' in normalized_sql:
            return 'join'
            
        if ' GROUP BY ' in normalized_sql or 'SUM(' in normalized_sql or 'COUNT(' in normalized_sql or 'AVG(' in normalized_sql or 'MIN(' in normalized_sql or 'MAX(' in normalized_sql:
            return 'aggregation'
            
        if ' WHERE ' in normalized_sql or ' HAVING ' in normalized_sql:
            return 'filter'
            
        if ' ORDER BY ' in normalized_sql or ' LIMIT ' in normalized_sql:
            return 'sorting'
            
        return 'simple'

    def _elapsed(self, start: float) -> float:
        """Calculate elapsed time in milliseconds."""
        return round((time.time() - start) * 1000, 2)
