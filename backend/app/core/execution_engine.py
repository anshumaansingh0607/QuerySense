"""
QuerySense — Execution Engine (Stage 4)
Runs SQL queries and captures results or structured errors.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from sqlalchemy import text, Engine


@dataclass
class ExecutionResult:
    """Result of a SQL query execution."""
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    columns: Optional[List[str]] = None
    row_count: int = 0
    error: Optional[str] = None
    error_type: Optional[str] = None


class ExecutionEngine:
    """Executes SQL queries against the database with error capture."""

    def execute(self, sql: str, engine: Engine) -> ExecutionResult:
        """
        Execute a SQL query and return structured results.

        Uses a read-only approach for SELECT queries.
        Captures and categorizes any database errors.
        """
        if not sql or not sql.strip():
            return ExecutionResult(
                success=False,
                error="Empty SQL query",
                error_type="ValidationError"
            )

        # Clean up SQL
        sql = sql.strip()
        if sql.endswith(';'):
            sql = sql[:-1]  # Remove trailing semicolon for SQLAlchemy text()

        try:
            with engine.connect() as conn:
                result = conn.execute(text(sql))

                # Check if the query returns rows (SELECT-like)
                if result.returns_rows:
                    columns = list(result.keys())
                    rows = [dict(row._mapping) for row in result.fetchall()]
                    return ExecutionResult(
                        success=True,
                        data=rows,
                        columns=columns,
                        row_count=len(rows),
                    )
                else:
                    # Non-SELECT (INSERT, UPDATE, etc.) — we don't commit in demo
                    return ExecutionResult(
                        success=True,
                        data=[],
                        columns=[],
                        row_count=result.rowcount if result.rowcount >= 0 else 0,
                    )

        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)

            # Simplify common error messages
            if "no such table" in error_msg.lower():
                error_type = "TableNotFound"
            elif "no such column" in error_msg.lower():
                error_type = "ColumnNotFound"
            elif "syntax error" in error_msg.lower() or "near" in error_msg.lower():
                error_type = "SyntaxError"
            elif "ambiguous column" in error_msg.lower():
                error_type = "AmbiguousColumn"

            return ExecutionResult(
                success=False,
                error=error_msg,
                error_type=error_type,
            )

    def explain(self, sql: str, engine: Engine) -> List[Dict[str, Any]]:
        """
        Run EXPLAIN QUERY PLAN on a SQL statement.
        Returns structured plan steps with performance annotations.
        """
        if not sql or not sql.strip():
            return []

        sql = sql.strip()
        if sql.endswith(';'):
            sql = sql[:-1]

        try:
            with engine.connect() as conn:
                result = conn.execute(text(f"EXPLAIN QUERY PLAN {sql}"))
                rows = [dict(row._mapping) for row in result.fetchall()]

                plan_steps = []
                for row in rows:
                    detail = row.get("detail", str(row))
                    step = {
                        "id": row.get("id", 0),
                        "parent": row.get("parent", 0),
                        "detail": detail,
                    }

                    # Annotate performance characteristics
                    detail_upper = detail.upper()
                    if "SCAN" in detail_upper and "INDEX" not in detail_upper:
                        step["type"] = "full_scan"
                        step["severity"] = "warning"
                        step["hint"] = "Full table scan — consider adding an index for better performance"
                    elif "SEARCH" in detail_upper and "INDEX" in detail_upper:
                        step["type"] = "index_search"
                        step["severity"] = "good"
                        step["hint"] = "Using index for efficient lookup"
                    elif "SCAN" in detail_upper and "INDEX" in detail_upper:
                        step["type"] = "index_scan"
                        step["severity"] = "info"
                        step["hint"] = "Scanning via index — acceptable for range queries"
                    elif "TEMP B-TREE" in detail_upper:
                        step["type"] = "temp_sort"
                        step["severity"] = "warning"
                        step["hint"] = "Temporary B-tree for sorting — consider an index on ORDER BY columns"
                    elif "SUBQUERY" in detail_upper or "CORRELATED" in detail_upper:
                        step["type"] = "subquery"
                        step["severity"] = "info"
                        step["hint"] = "Subquery execution"
                    elif "COMPOUND" in detail_upper:
                        step["type"] = "compound"
                        step["severity"] = "info"
                        step["hint"] = "Compound query (UNION/INTERSECT/EXCEPT)"
                    else:
                        step["type"] = "other"
                        step["severity"] = "info"
                        step["hint"] = ""

                    plan_steps.append(step)

                return plan_steps

        except Exception:
            return []
