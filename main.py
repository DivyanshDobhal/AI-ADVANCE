import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.generate import router as generate_router

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(
    title="AI Compiler Studio Backend",
    description="FastAPI-based multi-agent compiler backend utilizing Gemini and Groq",
    version="2.0.0"
)

# Configure CORS so Vite frontend on port 5173 (or others) can connect seamlessly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount generate endpoints under both standard paths to support all routing variations
app.include_router(generate_router, tags=["Generate"])
app.include_router(generate_router, prefix="/api", tags=["Generate (API)"])

@app.on_event("startup")
def startup_verification():
    if os.getenv("VERCEL"):
        logger.info("Running on Vercel — skipping local startup verification.")
        return

    logger.info("Initializing startup verification for Gemini and Groq integration.")
    from services.gemini_service import GeminiService
    from services.groq_service import GroqService

    if os.getenv("GEMINI_API_KEY"):
        if GeminiService.test_connection():
            logger.info("Gemini provider is online and responsive.")
        else:
            logger.warning("Gemini provider check failed or rate limited.")

    if os.getenv("GROQ_API_KEY"):
        if GroqService.test_connection():
            logger.info("Groq provider is online and responsive.")
        else:
            logger.warning("Groq provider check failed.")

@app.get("/health/llm")
def health_llm():
    """Check connectivity to configured AI providers (Gemini & Groq)."""
    from services.gemini_service import GeminiService
    from services.groq_service import GroqService

    has_gemini = bool(os.getenv("GEMINI_API_KEY"))
    has_groq = bool(os.getenv("GROQ_API_KEY"))

    gemini_online = GeminiService.test_connection() if has_gemini else False
    groq_online = GroqService.test_connection() if has_groq else False

    return {
        "status": "online" if (gemini_online or groq_online) else "degraded",
        "configured_provider": os.getenv("AI_PROVIDER", "auto"),
        "providers": {
            "gemini": {"configured": has_gemini, "online": gemini_online},
            "groq": {"configured": has_groq, "online": groq_online}
        }
    }

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "AI Compiler Studio Backend",
        "stage": "production",
        "agents": ["IntentAgent", "DesignAgent", "SchemaAgent", "Validator", "RepairAgent"]
    }

# Also support '/api/compile' as an alias endpoint to the main generate route
# This guarantees 100% backwards compatibility with zero frontend breaks
@app.post("/api/compile")
def compile_alias(payload: dict):
    # Map 'prompt' argument to the generate pipeline
    from routes.generate import GenerateRequest, generate_application
    req = GenerateRequest(prompt=payload.get("prompt", ""))
    return generate_application(req)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
