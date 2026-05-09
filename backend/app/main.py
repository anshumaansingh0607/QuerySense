"""
QuerySense — FastAPI Application
Main entry point with CORS, lifespan events, and static file serving.
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.api.routes import router, init_pipeline, set_llm_provider
from app.db.database import db_manager
from app.db.sample_data import create_sample_database  # noqa: drift simulation removed
from app.core.schema_manager import schema_manager
from app.core.pipeline import QueryPipeline
from app.llm.provider import get_provider
from app.models.schemas import HealthResponse

# ── Logging ──
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("querysense")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""

    # ── Startup ──
    logger.info("=" * 60)
    logger.info(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"  LLM Provider: {settings.LLM_PROVIDER}")
    logger.info(f"  Database Dir: {settings.DB_DIR}")
    logger.info("=" * 60)

    # 1. Create and populate demo database
    db_path = settings.default_db_path
    create_sample_database(db_path)
    db_manager.register("sales_db", db_path)
    logger.info(f"  Database registered: sales_db -> {db_path}")

    # 2. Determine LLM provider and resolve API key
    provider_name = settings.LLM_PROVIDER

    # Pick the correct API key based on the configured provider
    api_key = None
    if provider_name == "openai":
        api_key = settings.OPENAI_API_KEY
    elif provider_name == "anthropic":
        api_key = settings.ANTHROPIC_API_KEY
    elif provider_name == "groq":
        api_key = settings.GROQ_API_KEY

    if provider_name in ("openai", "anthropic", "groq") and not api_key:
        logger.warning(f"  {provider_name.upper()}_API_KEY not found in .env — falling back to mock mode.")
        provider_name = "mock"
        api_key = None

    llm = get_provider(
        provider_name,
        api_key=api_key,
        model=settings.default_model,
    )
    logger.info(f"  LLM Provider initialized: {llm.name}")

    # 3. Store schema baseline
    engine = db_manager.get_engine("sales_db")
    baseline = schema_manager.store_baseline("sales_db", engine)
    logger.info(f"  Schema baseline stored: {baseline['hash']}")
    logger.info(f"  Tables: {', '.join(baseline['tables'])}")

    # 4. Initialize pipeline
    pipeline = QueryPipeline(llm)
    init_pipeline(pipeline)
    set_llm_provider(llm)
    logger.info(f"  Query pipeline initialized")
    logger.info("=" * 60)
    logger.info(f"  Open http://localhost:{settings.PORT} in your browser")
    logger.info("=" * 60)

    yield

    # ── Shutdown ──
    logger.info("QuerySense shutting down...")


# ── Create App ──
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Natural Language to SQL with Self-Correction & Schema Drift Detection",
    lifespan=lifespan,
)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Routes ──
app.include_router(router)

# ── Static Files (Frontend) ──
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")

if os.path.isdir(frontend_dir):
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_dir, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_dir, "js")), name="js")


# ── Serve Frontend ──
@app.get("/")
async def serve_frontend():
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "QuerySense API is running. Frontend not found."}


# ── Health Check ──
@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        status="healthy",
        llm_provider=settings.LLM_PROVIDER,
        databases=db_manager.list_databases(),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
