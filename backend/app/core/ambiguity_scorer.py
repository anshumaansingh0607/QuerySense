"""
QuerySense — Ambiguity Scorer (Stage 2)
Evaluates query clarity and triggers clarification when needed.
"""

import json
import re
from app.llm.provider import LLMProvider
from app.llm.prompts import AMBIGUITY_SCORING_PROMPT


class AmbiguityScorer:
    """Scores natural language queries for ambiguity before SQL generation."""

    def __init__(self, llm: LLMProvider, threshold: float = 0.65):
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
            # On failure, assume the query is clear enough — don't block the user
            result = {
                "confidence_score": 0.9,
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
            
            # Try to find JSON object in the response
            json_match = re.search(r'\{[^{}]*\}', cleaned, re.DOTALL)
            if json_match:
                cleaned = json_match.group(0)
            
            data = json.loads(cleaned)
            
            # Clamp confidence_score to valid range
            score = float(data.get("confidence_score", 0.85))
            score = max(0.0, min(1.0, score))
            
            return {
                "confidence_score": score,
                "is_ambiguous": bool(data.get("is_ambiguous", False)),
                "ambiguities": list(data.get("ambiguities", [])),
                "clarification_question": str(data.get("clarification_question", "")),
            }
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            # Fallback: assume clear — score high so we don't block the user
            return {
                "confidence_score": 0.9,
                "is_ambiguous": False,
                "ambiguities": [],
                "clarification_question": "",
            }

