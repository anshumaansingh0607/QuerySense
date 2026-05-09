"""
QuerySense — Database Connection Manager
Manages SQLAlchemy engines and sessions for multiple named databases.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Dict, Optional
import os


class DatabaseManager:
    """Registry of named database connections."""

    def __init__(self):
        self._engines: Dict[str, any] = {}
        self._session_factories: Dict[str, sessionmaker] = {}

    def register(self, db_id: str, db_path: str) -> None:
        """Register a SQLite database by name."""
        url = f"sqlite:///{db_path}"
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            echo=False,
            pool_pre_ping=True,
        )
        self._engines[db_id] = engine
        self._session_factories[db_id] = sessionmaker(
            bind=engine, autocommit=False, autoflush=False
        )

    def get_engine(self, db_id: str):
        """Get the SQLAlchemy engine for a named database."""
        if db_id not in self._engines:
            raise ValueError(f"Database '{db_id}' is not registered. Available: {list(self._engines.keys())}")
        return self._engines[db_id]

    def get_session(self, db_id: str) -> Session:
        """Create a new session for a named database."""
        if db_id not in self._session_factories:
            raise ValueError(f"Database '{db_id}' is not registered.")
        return self._session_factories[db_id]()

    def list_databases(self) -> list:
        """List all registered database IDs."""
        return list(self._engines.keys())

    def is_registered(self, db_id: str) -> bool:
        return db_id in self._engines


# Global instance
db_manager = DatabaseManager()
