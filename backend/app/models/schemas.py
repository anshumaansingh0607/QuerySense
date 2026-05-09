"""
QuerySense — Pydantic Models
Request/response schemas for the API layer.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime


# ── Request Models ──

class QueryRequest(BaseModel):
    """Natural language query submission."""
    query: str = Field(..., min_length=3, description="Natural language question about your data")
    db_id: str = Field(default="sales_db", description="Target database identifier")


class ClarificationAnswer(BaseModel):
    """User's answer to a clarification question."""
    original_query: str
    clarification: str
    db_id: str = "sales_db"


# ── Structured Reasoning ──

class TableReason(BaseModel):
    """Why a specific table is used."""
    name: str
    reason: str

class ColumnReason(BaseModel):
    """Why a column is selected."""
    name: str
    reason: str

class FilterInfo(BaseModel):
    """A WHERE condition and why it's applied."""
    condition: str
    reason: str

class JoinInfo(BaseModel):
    """A JOIN and why it connects two tables."""
    tables: str
    condition: str
    type: str = "INNER JOIN"
    reason: str

class AggregationInfo(BaseModel):
    """An aggregation function and its purpose."""
    function: str
    column: str
    alias: Optional[str] = None
    reason: str

class SortingInfo(BaseModel):
    """An ORDER BY clause and its reason."""
    column: str
    direction: str = "ASC"
    reason: str

class StructuredReasoning(BaseModel):
    """Full structured reasoning for a SQL query."""
    intent: str = ""
    tables_used: List[TableReason] = []
    columns_selected: List[ColumnReason] = []
    filters: List[FilterInfo] = []
    joins: List[JoinInfo] = []
    aggregations: List[AggregationInfo] = []
    sorting: List[SortingInfo] = []
    assumptions: List[str] = []


# ── Response Models ──

class ColumnInfo(BaseModel):
    name: str
    type: str
    primary_key: bool = False
    foreign_key: Optional[str] = None


class TableInfo(BaseModel):
    name: str
    columns: List[ColumnInfo]
    row_count: Optional[int] = None


class CorrectionStep(BaseModel):
    """One step in the self-correction history."""
    attempt: int
    sql: str
    error: str


class ClarificationNeeded(BaseModel):
    """Returned when the query is ambiguous."""
    needs_clarification: bool = True
    question: str
    ambiguities: List[str]
    confidence_score: float


class QueryResponse(BaseModel):
    """Full response from the query pipeline."""
    success: bool
    sql: Optional[str] = None
    original_sql: Optional[str] = None  # Pre-correction SQL for diff view
    result: Optional[List[Dict[str, Any]]] = None
    columns: Optional[List[str]] = None
    row_count: Optional[int] = None
    explanation: Optional[str] = None
    reasoning: Optional[StructuredReasoning] = None  # Structured reasoning
    tables_used: Optional[List[str]] = None  # Tables referenced in query
    assumptions: Optional[List[str]] = None  # Assumptions made by LLM
    query_type: Optional[str] = None  # aggregation, filter, join, simple
    corrections: int = 0
    correction_history: Optional[List[CorrectionStep]] = None
    drift_detected: bool = False
    drift_changes: Optional[List[str]] = None
    ambiguity_score: Optional[float] = None
    clarification: Optional[ClarificationNeeded] = None
    error: Optional[str] = None
    execution_time_ms: Optional[float] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class SchemaStatusResponse(BaseModel):
    """Schema drift status for a database."""
    db_id: str
    status: str  # "ok" | "drifted" | "unknown"
    current_hash: Optional[str] = None
    baseline_hash: Optional[str] = None
    changes: Optional[List[str]] = None
    tables: Optional[List[TableInfo]] = None
    last_checked: Optional[str] = None


class HistoryEntry(BaseModel):
    """A single query history entry."""
    id: int
    query: str
    sql: Optional[str] = None
    success: bool
    corrections: int = 0
    query_type: Optional[str] = None
    tables_used: Optional[List[str]] = None
    execution_time_ms: Optional[float] = None
    timestamp: str


class AnalyticsResponse(BaseModel):
    """System analytics and performance metrics."""
    total_queries: int = 0
    success_rate: float = 0.0
    avg_execution_time: float = 0.0
    total_corrections: int = 0
    correction_rate: float = 0.0
    avg_corrections_per_query: float = 0.0
    most_common_query_type: Optional[str] = None
    intelligence_score: float = 0.0  # Based on success_rate + correction_rate
    query_type_breakdown: Dict[str, int] = {}
    correction_distribution: Dict[str, int] = {}  # "0" -> count, "1" -> count, etc.
    execution_times: List[float] = []
    most_used_tables: Dict[str, int] = {}
    most_failed_queries: List[Dict[str, Any]] = []
    queries_with_corrections: List[Dict[str, Any]] = []


class HealthResponse(BaseModel):
    app: str
    version: str
    status: str
    llm_provider: str
    databases: List[str]
