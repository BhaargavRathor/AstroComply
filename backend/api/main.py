from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.routes import satellites, metrics, analysis, health, regulations, uipath
from backend.api.routes import assess

app = FastAPI(
    title="MOSIP API",
    description=(
        "Multi-Agent Orbital Sustainability Intelligence Platform — "
        "REST API for orbital data, risk assessment, multi-agent intelligence, "
        "compliance grading, sustainability analysis, and forecast modeling."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow all origins during development (tighten in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Existing routes ───────────────────────────────────────────────────────────
app.include_router(health.router,     tags=["Health"])
app.include_router(satellites.router, prefix="/satellites", tags=["Satellites"])
app.include_router(analysis.router,   prefix="/analyze",    tags=["Analysis"])
app.include_router(metrics.router,    prefix="/metrics",    tags=["Metrics"])
app.include_router(regulations.router, prefix="/regulations", tags=["Regulations"])

# ── Multi-agent intelligence routes ──────────────────────────────────────────
app.include_router(
    assess.router,
    prefix="/assess",
    tags=["🤖 Multi-Agent Intelligence"],
)

# ── UiPath Orchestration Simulator routes ─────────────────────────────────────
app.include_router(
    uipath.router,
    prefix="/uipath",
    tags=["UiPath Orchestration"],
)

