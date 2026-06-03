"""
QuerySense — Schema Manager (Stage 1)
Introspects database schemas, computes hashes, and detects drift.
"""

import hashlib
import json
from typing import Dict, List, Optional, Tuple
from sqlalchemy import inspect, Engine
from datetime import datetime, timezone


class SchemaManager:
    """Manages database schema introspection, hashing, and drift detection."""

    def __init__(self):
        # Stored baselines: db_id -> {hash, schema, timestamp}
        self._baselines: Dict[str, dict] = {}

    def introspect_schema(self, engine: Engine) -> Dict:
        """
        Extract full schema metadata from a database using SQLAlchemy inspection.
        Returns a dict of tables with their columns, types, PKs, and FKs.
        """
        inspector = inspect(engine)
        schema = {}

        for table_name in inspector.get_table_names():
            columns = []
            pk_cols = inspector.get_pk_constraint(table_name)
            pk_names = pk_cols.get("constrained_columns", []) if pk_cols else []
            
            fk_list = inspector.get_foreign_keys(table_name)
            fk_map = {}
            for fk in fk_list:
                for col in fk.get("constrained_columns", []):
                    ref_table = fk.get("referred_table", "")
                    ref_cols = fk.get("referred_columns", [])
                    fk_map[col] = f"{ref_table}.{ref_cols[0]}" if ref_cols else ref_table

            for col in inspector.get_columns(table_name):
                col_info = {
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "primary_key": col["name"] in pk_names,
                    "foreign_key": fk_map.get(col["name"]),
                    "default": str(col.get("default", "")) if col.get("default") else None,
                }
                columns.append(col_info)

            schema[table_name] = {
                "columns": columns,
                "primary_keys": pk_names,
                "foreign_keys": fk_list,
            }

        return schema

    def compute_schema_hash(self, schema: Dict) -> str:
        """Compute a deterministic SHA-256 hash of the schema structure."""
        # Normalize: sort keys and use consistent serialization
        normalized = json.dumps(schema, sort_keys=True, default=str)
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    def store_baseline(self, db_id: str, engine: Engine) -> dict:
        """Introspect and store the current schema as the baseline."""
        schema = self.introspect_schema(engine)
        schema_hash = self.compute_schema_hash(schema)
        
        self._baselines[db_id] = {
            "hash": schema_hash,
            "schema": schema,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        return {
            "db_id": db_id,
            "hash": schema_hash,
            "tables": list(schema.keys()),
            "timestamp": self._baselines[db_id]["timestamp"],
        }

    def check_drift(self, db_id: str, engine: Engine) -> Tuple[bool, Optional[List[str]]]:
        """
        Compare the current schema against the stored baseline.
        Returns (has_drifted, list_of_changes).
        """
        if db_id not in self._baselines:
            # No baseline yet, store one
            self.store_baseline(db_id, engine)
            return False, None

        current_schema = self.introspect_schema(engine)
        current_hash = self.compute_schema_hash(current_schema)
        baseline_hash = self._baselines[db_id]["hash"]

        if current_hash == baseline_hash:
            return False, None

        # Schema has drifted - compute the diff
        changes = self.diff_schemas(
            self._baselines[db_id]["schema"],
            current_schema
        )
        return True, changes

    def diff_schemas(self, old_schema: Dict, new_schema: Dict) -> List[str]:
        """Compute human-readable diff between two schema snapshots."""
        changes = []

        old_tables = set(old_schema.keys())
        new_tables = set(new_schema.keys())

        # New tables
        for table in new_tables - old_tables:
            col_names = [c["name"] for c in new_schema[table]["columns"]]
            changes.append(f"New table '{table}' added with columns: {', '.join(col_names)}")

        # Dropped tables
        for table in old_tables - new_tables:
            changes.append(f"Table '{table}' was dropped")

        # Modified tables
        for table in old_tables & new_tables:
            old_cols = {c["name"]: c for c in old_schema[table]["columns"]}
            new_cols = {c["name"]: c for c in new_schema[table]["columns"]}

            # New columns
            for col in set(new_cols.keys()) - set(old_cols.keys()):
                col_type = new_cols[col]["type"]
                changes.append(f"Column '{table}.{col}' added (type: {col_type})")

            # Dropped columns
            for col in set(old_cols.keys()) - set(new_cols.keys()):
                changes.append(f"Column '{table}.{col}' was dropped")

            # Type changes
            for col in set(old_cols.keys()) & set(new_cols.keys()):
                if str(old_cols[col]["type"]) != str(new_cols[col]["type"]):
                    changes.append(
                        f"Column '{table}.{col}' type changed: "
                        f"{old_cols[col]['type']} → {new_cols[col]['type']}"
                    )

        return changes

    def refresh_baseline(self, db_id: str, engine: Engine) -> dict:
        """Force re-introspection and update the stored baseline."""
        return self.store_baseline(db_id, engine)

    def get_baseline(self, db_id: str) -> Optional[dict]:
        """Get the stored baseline for a database."""
        return self._baselines.get(db_id)

    def format_schema_for_prompt(self, schema: Dict) -> str:
        """Format schema as CREATE TABLE statements for LLM prompt injection."""
        lines = []
        for table_name, table_info in schema.items():
            cols = []
            for col in table_info["columns"]:
                col_def = f"    {col['name']} {col['type']}"
                if col["primary_key"]:
                    col_def += " PRIMARY KEY"
                if col.get("foreign_key"):
                    col_def += f" REFERENCES {col['foreign_key']}"
                if not col.get("nullable", True):
                    col_def += " NOT NULL"
                cols.append(col_def)
            
            lines.append(f"CREATE TABLE {table_name} (")
            lines.append(",\n".join(cols))
            lines.append(");")
            lines.append("")  # blank line between tables

        return "\n".join(lines)

    def get_schema_tables_info(self, engine: Engine) -> List[dict]:
        """Get a list of tables with column info for UI display."""
        schema = self.introspect_schema(engine)
        tables = []
        for table_name, table_info in schema.items():
            columns = []
            for col in table_info["columns"]:
                columns.append({
                    "name": col["name"],
                    "type": str(col["type"]),
                    "primary_key": col["primary_key"],
                    "foreign_key": col.get("foreign_key"),
                })
            
            # Get row count
            try:
                from sqlalchemy import text
                with engine.connect() as conn:
                    result = conn.execute(text(f"SELECT COUNT(*) FROM \"{table_name}\""))
                    row_count = result.scalar()
            except Exception:
                row_count = None

            tables.append({
                "name": table_name,
                "columns": columns,
                "row_count": row_count,
            })
        return tables


# Global instance
schema_manager = SchemaManager()
