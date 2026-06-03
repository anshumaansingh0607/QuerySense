"""
QuerySense — Application Configuration
Manages all settings via environment variables with sensible defaults.
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    # --- Application ---
    APP_NAME: str = "QuerySense"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    LLM_PROVIDER: str = "mock"
    OPENAI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    LLM_MODEL: Optional[str] = None 

    # --- Database ---
    DB_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    
    # --- Pipeline ---
    MAX_RETRIES: int = 3
    AMBIGUITY_THRESHOLD: float = 0.65
    QUERY_TIMEOUT: int = 10  # seconds

    # --- Server ---
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    @property
    def default_db_path(self) -> str:
        os.makedirs(self.DB_DIR, exist_ok=True)
        return os.path.join(self.DB_DIR, "sales_db.sqlite")

    @property
    def default_model(self) -> str:
        if self.LLM_PROVIDER == "mock":
            return "mock"
        if self.LLM_MODEL and self.LLM_MODEL != "mock":
            return self.LLM_MODEL
        if self.LLM_PROVIDER == "openai":
            return "gpt-4o"
        elif self.LLM_PROVIDER == "anthropic":
            return "claude-3-5-sonnet-20241022"
        elif self.LLM_PROVIDER == "groq":
            return "llama3-8b-8192"
        return "mock"

    model_config = {
        "env_file": os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
        "frozen": False,
    }


settings = Settings()
