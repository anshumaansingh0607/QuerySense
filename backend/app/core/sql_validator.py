"""
QuerySense — SQL Validator
Pre-execution validation to catch dangerous operations and basic syntax issues.
"""

import re
import logging
from typing import Tuple, Optional, Set

logger = logging.getLogger(__name__)

# SQL keywords that indicate write/destructive operations
DANGEROUS_KEYWORDS = {
    "DROP", "DELETE", "TRUNCATE", "ALTER", "INSERT", "UPDATE",
    "CREATE", "REPLACE", "RENAME", "GRANT", "REVOKE",
    "ATTACH", "DETACH", "VACUUM", "REINDEX",
}

# Only these are allowed as the first keyword
ALLOWED_FIRST_KEYWORDS = {"SELECT", "WITH", "EXPLAIN"}


class SQLValidationResult:
    """Result of SQL validation."""
    def __init__(self, valid: bool, sql: str, error: Optional[str] = None, warnings: list = None):
        self.valid = valid
        self.sql = sql
        self.error = error
        self.warnings = warnings or []


class SQLValidator:
    """Validates SQL queries before execution."""

    def __init__(self, known_tables: Optional[Set[str]] = None):
        self._known_tables = known_tables or set()

    def update_known_tables(self, tables: Set[str]):
        """Update the set of known table names."""
        self._known_tables = tables

    def validate(self, sql: str) -> SQLValidationResult:
        """
        Validate a SQL query for safety and basic correctness.

        Checks:
        1. Non-empty
        2. No dangerous operations (DROP, DELETE, etc.)
        3. Starts with SELECT or WITH
        4. Balanced parentheses
        5. Table names exist in known schema (warning only)
        """
        if not sql or not sql.strip():
            return SQLValidationResult(False, sql, "Empty SQL query")

        sql = sql.strip()
        warnings = []

        # 1. Check for dangerous keywords
        # Tokenize and check first keyword
        tokens = re.findall(r'\b[A-Z]+\b', sql.upper())
        if not tokens:
            return SQLValidationResult(False, sql, "No SQL keywords found")

        first_keyword = tokens[0]
        if first_keyword not in ALLOWED_FIRST_KEYWORDS:
            if first_keyword in DANGEROUS_KEYWORDS:
                return SQLValidationResult(
                    False, sql,
                    f"Dangerous operation '{first_keyword}' is not allowed. Only SELECT queries are permitted."
                )
            return SQLValidationResult(
                False, sql,
                f"Query must start with SELECT or WITH. Found: '{first_keyword}'"
            )

        # 2. Check for dangerous keywords anywhere (e.g. subqueries with DELETE)
        for token in tokens:
            if token in DANGEROUS_KEYWORDS:
                return SQLValidationResult(
                    False, sql,
                    f"Query contains dangerous keyword '{token}'. Only read-only queries are allowed."
                )

        # 3. Balanced parentheses
        open_parens = sql.count('(')
        close_parens = sql.count(')')
        if open_parens != close_parens:
            return SQLValidationResult(
                False, sql,
                f"Unbalanced parentheses: {open_parens} opening vs {close_parens} closing"
            )

        # 4. Check table references against known schema (warnings only)
        if self._known_tables:
            # Extract table names from FROM and JOIN clauses
            from_matches = re.findall(
                r'\b(?:FROM|JOIN)\s+(\w+)', sql, re.IGNORECASE
            )
            for table_ref in from_matches:
                if table_ref.upper() not in {t.upper() for t in self._known_tables}:
                    warnings.append(f"Table '{table_ref}' not found in known schema")

        logger.debug(f"SQL validation passed: {sql[:80]}...")
        return SQLValidationResult(True, sql, warnings=warnings)
