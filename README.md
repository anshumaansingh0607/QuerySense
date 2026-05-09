# QuerySense

> **Natural Language to SQL** with Self-Correction & Schema Drift Detection

QuerySense is an intelligent NL-to-SQL system that goes beyond basic text-to-SQL conversion. It handles query ambiguity, explains its reasoning, self-corrects failed queries, and detects when the underlying database schema has changed.

## Features

- **NL-to-SQL Translation** — Ask questions in plain English, get executable SQL
- **Self-Correction Engine** — Failed queries are automatically retried with error context
- **Schema Drift Detection** — Hash-based detection of database structure changes
- **Ambiguity Scoring** — Vague queries trigger clarification before generation
- **Reasoning Transparency** — Every query comes with a plain-English explanation

## Quick Start

```bash
# 1. Install dependencies
cd backend
pip install -r requirements.txt

# 2. Start the server (uses mock LLM by default — no API key needed)
python -m uvicorn app.main:app --reload --port 8000

# 3. Open in browser
# http://localhost:8000
```

## Using a Real LLM

```bash
# Copy .env.example to .env
cp .env.example .env

# Set your provider and API key
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
```

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/query` | POST | Submit NL query → get SQL + results |
| `/api/query/clarify` | POST | Submit clarified query |
| `/api/schema/status` | GET | Check schema drift status |
| `/api/schema/refresh` | POST | Force schema re-introspection |
| `/api/schema/tables` | GET | Get table/column info |
| `/api/schema/simulate-drift` | POST | Demo: simulate a schema change |
| `/api/history` | GET | Recent query history |
| `/health` | GET | Health check |

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy
- **Frontend**: HTML/CSS/JS (no framework)
- **Database**: SQLite (PostgreSQL-ready via config)
- **LLM**: OpenAI / Anthropic / Mock (configurable)

## Architecture

```
User Query → Schema Manager → Ambiguity Scorer → SQL Generator → Execution Engine → Self-Corrector
                  ↓                   ↓                 ↓               ↓                ↓
           Check drift         Score clarity      LLM → SQL        Run SQL         Retry + fix
```
