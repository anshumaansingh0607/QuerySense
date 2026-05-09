"""
QuerySense — Ambiguity Scorer (Stage 2)
Evaluates query clarity and triggers clarification when needed.
"""

import json
import re
from typing import Tuple, Optional
from app.llm.provider import LLMProvider
from app.llm.prompts import AMBIGUITY_SCORING_PROMPT


class AmbiguityScorer:
    """Scores natural language queries for ambiguity before SQL generation."""

    def __init__(self, llm: LLMProvider, threshold: float = 0.7):
        self._llm = llm
        self._threshold = threshold

    def score_query(self, query: str, schema_context: str) -> dict:
        """
        Evaluate query clarity using the LLM.

        Returns:
            {
                "confidence_score": float,
                "is_ambiguous": bool,
                "ambiguities": list[str],
                "clarification_question": str,
                "needs_clarification": bool
            }
        """
        prompt = AMBIGUITY_SCORING_PROMPT.format(
            schema=schema_context,
            query=query
        )

        try:
            response = self._llm.complete(prompt)
            result = self._parse_response(response)
        except Exception as e:
            # On failure, assume the query is clear enough
            result = {
                "confidence_score": 0.8,
                "is_ambiguous": False,
                "ambiguities": [],
                "clarification_question": "",
            }

        # Apply threshold
        result["needs_clarification"] = result["confidence_score"] < self._threshold
        return result

    def _parse_response(self, response: str) -> dict:
        """Parse the LLM's ambiguity scoring response."""
        # Try to extract JSON from the response
        try:
            # Remove any markdown code fences
            cleaned = re.sub(r'```json?\n?', '', response)
            cleaned = re.sub(r'```', '', cleaned)
            cleaned = cleaned.strip()
            
            data = json.loads(cleaned)
            return {
                "confidence_score": float(data.get("confidence_score", 0.8)),
                "is_ambiguous": bool(data.get("is_ambiguous", False)),
                "ambiguities": list(data.get("ambiguities", [])),
                "clarification_question": str(data.get("clarification_question", "")),
            }
        except (json.JSONDecodeError, KeyError, TypeError):
            # Fallback: assume clear
            return {
                "confidence_score": 0.8,
                "is_ambiguous": False,
                "ambiguities": [],
                "clarification_question": "",
            }
