"""
QuerySense — SQL Generator (Stage 3)
LLM-powered natural language to SQL translation with structured reasoning.
"""

import json
import re
from typing import Optional, Dict
from app.llm.provider import LLMProvider
from app.llm.prompts import SYSTEM_PROMPT, SQL_GENERATION_PROMPT


class SQLGenerator:
    """Generates SQL from natural language queries using an LLM."""

    def __init__(self, llm: LLMProvider):
        self._llm = llm

    def generate(self, query: str, schema_context: str, clarifications: Optional[str] = None) -> Dict:
        """
        Generate SQL from a natural language query.

        Args:
            query: The user's natural language question
            schema_context: Formatted CREATE TABLE statements
            clarifications: Optional user clarifications for ambiguous queries

        Returns:
            {
                "sql": str,
                "explanation": str,
                "reasoning": {...},  # Structured reasoning
                "tables_used": list[str],
                "assumptions": list[str]
            }
        """
        full_query = query
        if clarifications:
            full_query = f"{query} (Clarification: {clarifications})"

        prompt = SQL_GENERATION_PROMPT.format(
            schema=schema_context,
            query=full_query
        )

        response = self._llm.complete(prompt, system_prompt=SYSTEM_PROMPT)
        return self._parse_response(response)

    def _parse_response(self, response: str) -> Dict:
        """Parse the LLM's SQL generation response with structured reasoning."""
        try:
            cleaned = re.sub(r'```json?\n?', '', response)
            cleaned = re.sub(r'```', '', cleaned)
            cleaned = cleaned.strip()

            data = json.loads(cleaned)

            sql = data.get("sql", "").strip()
            sql = re.sub(r'^```sql\s*', '', sql)
            sql = re.sub(r'\s*```$', '', sql)
            sql = sql.strip().rstrip(';') + ';' if sql and not sql.endswith(';') else sql

            # Extract structured reasoning
            reasoning = data.get("reasoning", {})
            
            # Build legacy explanation from reasoning for backward compatibility
            explanation = self._build_explanation_from_reasoning(reasoning)
            
            # Extract flat tables_used list from reasoning
            tables_used = []
            if reasoning.get("tables_used"):
                tables_used = [t["name"] if isinstance(t, dict) else t for t in reasoning["tables_used"]]
            elif data.get("tables_used"):
                tables_used = data["tables_used"]

            # Extract flat assumptions list  
            assumptions = reasoning.get("assumptions", data.get("assumptions", []))

            return {
                "sql": sql,
                "explanation": explanation,
                "reasoning": reasoning,
                "tables_used": tables_used,
                "assumptions": assumptions,
            }

        except (json.JSONDecodeError, KeyError, TypeError):
            sql = self._extract_sql_fallback(response)
            return {
                "sql": sql,
                "explanation": "Query generated (response parsing used fallback mode).",
                "reasoning": {},
                "tables_used": [],
                "assumptions": [],
            }

    def _build_explanation_from_reasoning(self, reasoning: dict) -> str:
        """Build a human-readable explanation from structured reasoning."""
        if not reasoning:
            return "SQL query generated from your question."
        
        parts = []
        
        # Intent
        intent = reasoning.get("intent", "")
        if intent:
            parts.append(intent)
        
        # Tables
        tables = reasoning.get("tables_used", [])
        if tables:
            table_names = [t["name"] if isinstance(t, dict) else t for t in tables]
            if len(table_names) > 1:
                parts.append(f"Uses {', '.join(table_names)} tables.")
        
        # Joins
        joins = reasoning.get("joins", [])
        if joins:
            for j in joins:
                if isinstance(j, dict):
                    parts.append(f"Joins {j.get('tables', '')} on {j.get('condition', '')}.")
        
        # Aggregations
        aggs = reasoning.get("aggregations", [])
        if aggs:
            agg_descs = []
            for a in aggs:
                if isinstance(a, dict):
                    agg_descs.append(f"{a.get('function', '')}({a.get('column', '')})")
            if agg_descs:
                parts.append(f"Applies {', '.join(agg_descs)}.")
        
        # Filters
        filters = reasoning.get("filters", [])
        if filters:
            for f in filters:
                if isinstance(f, dict):
                    parts.append(f"Filters by: {f.get('condition', '')}.")
        
        return " ".join(parts) if parts else "SQL query generated from your question."

    def _extract_sql_fallback(self, response: str) -> str:
        """Last-resort SQL extraction using regex."""
        sql_match = re.search(r'```sql\n(.+?)\n```', response, re.DOTALL)
        if sql_match:
            return sql_match.group(1).strip()

        sql_match = re.search(
            r'\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b.+?;',
            response,
            re.DOTALL | re.IGNORECASE
        )
        if sql_match:
            return sql_match.group(0).strip()

        return response.strip()
