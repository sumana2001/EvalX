"""
EvalX Evaluator - Python evaluation service.

Provides the 5 pillars of LLM output evaluation:
1. Schema Validity - JSON schema validation
2. Completeness - Required fields populated
3. Context Relevance - Input/context similarity
4. RAG Faithfulness - Answer grounded in context
5. LLM-as-a-Judge - Quality scoring

All evaluation is done locally (no paid APIs required).
LLM-as-a-Judge uses Groq's free tier.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .config import get_settings
from .models import (
    EvaluationRequest,
    EvaluationResponse,
    EvaluationMetrics,
    EvaluationStatus,
    FailureType,
    HealthResponse,
)

load_dotenv()

settings = get_settings()

app = FastAPI(
    title="EvalX Evaluator",
    description="Python evaluation service for schema validation, RAG metrics, and LLM-as-a-Judge",
    version="1.0.0",
)

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Health Check
# ============================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    Reports status of embedding model and judge availability.
    """
    return HealthResponse(
        status="ok",
        service="evalx-evaluator",
        embedding_model=settings.embedding_model,
        judge_available=settings.groq_api_key is not None,
    )


# ============================================================
# Evaluation Endpoint
# ============================================================

@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(request: EvaluationRequest):
    """
    Evaluate an LLM output against the 5 pillars.

    Flow:
    1. Validate JSON schema (if expected_schema provided)
    2. Calculate completeness (required fields populated)
    3. Calculate context relevance (if context provided)
    4. Calculate faithfulness (if context + ground_truth provided)
    5. Get LLM judge score (if judge available)
    6. Classify failures based on thresholds
    """
    try:
        # TODO: Implement actual evaluation in next logical units
        # For now, return a placeholder successful response

        metrics = EvaluationMetrics(
            schema_valid=True,
            completeness=1.0,
            context_relevance=0.85 if request.context else None,
            faithfulness=0.90 if request.context else None,
            judge_score=8 if settings.groq_api_key else None,
            judge_reasoning="Placeholder - evaluation not yet implemented",
        )

        return EvaluationResponse(
            job_id=request.job_id,
            run_id=request.run_id,
            task_item_id=request.task_item_id,
            prompt_variant_id=request.prompt_variant_id,
            model=request.model,
            repetition_index=request.repetition_index,
            status=EvaluationStatus.SUCCESS,
            metrics=metrics,
            latency_ms=request.latency_ms,
            prompt_tokens=request.prompt_tokens,
            completion_tokens=request.completion_tokens,
            total_tokens=request.total_tokens,
            estimated_cost_usd=request.estimated_cost_usd,
            raw_output=request.raw_output,
        )

    except Exception as e:
        # Return failure response instead of raising
        return EvaluationResponse(
            job_id=request.job_id,
            run_id=request.run_id,
            task_item_id=request.task_item_id,
            prompt_variant_id=request.prompt_variant_id,
            model=request.model,
            repetition_index=request.repetition_index,
            status=EvaluationStatus.FAILED,
            failure_type=FailureType.EVALUATOR_ERROR,
            failure_reason=str(e),
            latency_ms=request.latency_ms,
            prompt_tokens=request.prompt_tokens,
            completion_tokens=request.completion_tokens,
            total_tokens=request.total_tokens,
            estimated_cost_usd=request.estimated_cost_usd,
            raw_output=request.raw_output,
        )


# ============================================================
# Startup/Shutdown Events
# ============================================================

@app.on_event("startup")
async def startup_event():
    """Initialize resources on startup."""
    print(f"[Evaluator] Starting...")
    print(f"[Evaluator] Embedding model: {settings.embedding_model}")
    print(f"[Evaluator] Judge available: {settings.groq_api_key is not None}")
    # TODO: Pre-load embedding model here for faster first request


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown."""
    print("[Evaluator] Shutting down...")
