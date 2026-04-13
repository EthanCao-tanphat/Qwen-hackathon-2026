from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import labs, scribe, bodyscan

app = FastAPI(
    title="Healix API",
    description="AI-Powered Health Intelligence Platform — powered by Qwen on Alibaba Cloud",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(labs.router, prefix="/api/labs", tags=["Labs Analyzer"])
app.include_router(scribe.router, prefix="/api/scribe", tags=["Clinical Scribe"])
app.include_router(bodyscan.router, prefix="/api/bodyscan", tags=["Body Scan"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "healix"}
