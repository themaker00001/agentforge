"""AgentForge Backend — FastAPI Application Entry Point"""

import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env if present
load_dotenv()

# Import routers
from app.routes import flow, execute, models, knowledge, tools, chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown logic."""
    import httpx
    print("🚀 AgentForge backend starting…")
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get("http://localhost:11434/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                model_names = [m["name"] for m in data.get("models", [])]
                print(f"✅ Ollama connected — models: {', '.join(model_names) or 'none installed'}")
    except Exception:
        print("⚠️  Ollama not running — start with: ollama serve")
    yield
    print("👋 AgentForge backend shutting down.")


app = FastAPI(
    title="AgentForge API",
    description="Local-first AI agent workflow backend",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow React dev server and any local origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(flow.router,      tags=["Flow"])
app.include_router(execute.router,   tags=["Execute"])
app.include_router(chat.router,      tags=["Chat"])
app.include_router(models.router,    tags=["Models"])
app.include_router(knowledge.router, tags=["Knowledge"])
app.include_router(tools.router,     tags=["Tools"])


@app.get("/")
async def root():
    return {"status": "ok", "service": "AgentForge API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
