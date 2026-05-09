"""
QuerySense — Self-Corrector (Stage 5)
Retry loop that feeds execution errors back to the LLM for correction.
Detects duplicate SQL to prevent infinite loops.
"""

import json
import re
from typing import List, Dict, Optional, Tuple
from app.llm.provider import LLMProvider
from app.llm.prompts import SYSTEM_PROMPT, SELF_CORRECTION_PROMPT


class CorrectionStep:
    """One step in the correction history."""
    def __init__(self, attempt: int, sql: str, error: str):
        self.attempt = attempt
        self.sql = sql
        self.error = error

    def to_dict(self) -> dict:
        return {
            "attempt": self.attempt,
            "sql": self.sql,
            "error": self.error,
        }


class SelfCorrector:
    """
    Self-correction engine that retries failed SQL generation
    with error context fed back to the LLM.
    
    Enhancements:
    - Tracks ALL correction attempts with full history
    - Detects duplicate SQL (stops if LLM returns same SQL)
    - Returns structured correction result
    """

    def __init__(self, llm: LLMProvider, max_retries: int = 3):
        self._llm = llm
        self._max_retries = max_retries

    def correct(
        self,
        query: str,
        failed_sql: str,
        error_msg: str,
        schema_context: str,
        history: Optional[List[CorrectionStep]] = None,
    ) -> Tuple[Optional[str], str, List[CorrectionStep]]:
        """
        Attempt to correct a failed SQL query.

        Args:
            query: Original natural language question
            failed_sql: The SQL that failed
            error_msg: The database error message
            schema_context: Formatted schema
            history: Previous correction attempts

        Returns:
            (corrected_sql, explanation, updated_history)
            
        Intelligence features:
            - Stops if corrected SQL is identical to the failed SQL
            - Stops if corrected SQL was already tried in history
            - Stops if max retries exhausted
        """
        if history is None:
            history = []

        # Record this failure
        attempt_num = len(history) + 1
        history.append(CorrectionStep(
            attempt=attempt_num,
            sql=failed_sql,
            error=error_msg,
        ))

        # Check if we've exhausted retries
        if attempt_num > self._max_retries:
            return None, f"All {self._max_retries} correction attempts exhausted.", history

        # Build history string for the prompt
        history_str = self._format_history(history)

        prompt = SELF_CORRECTION_PROMPT.format(
            schema=schema_context,
            query=query,
            failed_sql=failed_sql,
            error=error_msg,
            history=history_str,
        )

        try:
            response = self._llm.complete(prompt, system_prompt=SYSTEM_PROMPT)
            result = self._parse_response(response)
            corrected_sql = result["sql"]
            
            # ── Duplicate Detection ──
            # Stop if the LLM returned the exact same SQL
            if self._normalize_sql(corrected_sql) == self._normalize_sql(failed_sql):
                return None, "Self-correction returned identical SQL — stopping to avoid infinite loop.", history
            
            # Stop if this SQL was already tried in a previous attempt
            previous_sqls = {self._normalize_sql(step.sql) for step in history}
            if self._normalize_sql(corrected_sql) in previous_sqls:
                return None, "Self-correction returned previously-tried SQL — stopping to avoid cycles.", history
            
            return corrected_sql, result["explanation"], history
            
        except Exception as e:
            return None, f"Self-correction failed: {str(e)}", history

    def _normalize_sql(self, sql: str) -> str:
        """Normalize SQL for comparison (collapse whitespace, lowercase, strip)."""
        if not sql:
            return ""
        return re.sub(r'\s+', ' ', sql.strip().lower().rstrip(';'))

    def _format_history(self, history: List[CorrectionStep]) -> str:
        """Format correction history for prompt injection."""
        if not history:
            return "No previous attempts."
        
        lines = []
        for step in history:
            lines.append(f"Attempt {step.attempt}:")
            lines.append(f"  SQL: {step.sql}")
            lines.append(f"  Error: {step.error}")
            lines.append("")
        return "\n".join(lines)

    def _parse_response(self, response: str) -> Dict:
        """Parse the LLM's correction response."""
        try:
            cleaned = re.sub(r'```json?\n?', '', response)
            cleaned = re.sub(r'```', '', cleaned)
            cleaned = cleaned.strip()

            data = json.loads(cleaned)

            sql = data.get("sql", "").strip()
            sql = re.sub(r'^```sql\s*', '', sql)
            sql = re.sub(r'\s*```$', '', sql)

            return {
                "sql": sql,
                "explanation": data.get("explanation", "Applied correction."),
                "fix_description": data.get("fix_description", ""),
            }
        except (json.JSONDecodeError, KeyError, TypeError):
            sql_match = re.search(r'(SELECT|INSERT|UPDATE|DELETE).+?;', response, re.DOTALL | re.IGNORECASE)
            sql = sql_match.group(0) if sql_match else ""
            return {
                "sql": sql,
                "explanation": "Applied correction (fallback parsing).",
                "fix_description": "",
            }
