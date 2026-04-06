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

import time
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
from .schema_validator import validate_and_score
from .embedder import semantic_similarity, context_faithfulness, get_model
from .llm_judge import judge_response

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
        eval_start = time.time()
        
        # === Pillar 1 & 2: Schema Validation & Completeness ===
        schema_result = validate_and_score(request.raw_output, request.expected_schema)
        
        schema_valid = schema_result["schema_valid"]
        completeness = schema_result["completeness"]
        
        # Track failure info
        failure_type = None
        failure_reason = None
        
        # Check for schema failure
        if not schema_valid:
            if schema_result["parse_error"]:
                failure_type = FailureType.SCHEMA_VIOLATION
                failure_reason = schema_result["parse_error"]
            elif schema_result["validation_error"]:
                failure_type = FailureType.SCHEMA_VIOLATION
                failure_reason = schema_result["validation_error"]
        
        # === Pillar 3: Context Relevance (input vs context) ===
        context_relevance = None
        if request.context:
            # Split context into chunks if it's a long string
            context_chunks = [request.context] if isinstance(request.context, str) else request.context
            # Measure how relevant the input is to the context
            context_relevance = semantic_similarity(request.input, request.context)
        
        # === Pillar 4: RAG Faithfulness (output grounded in context) ===
        faithfulness = None
        if request.context:
            # Use parsed output or raw output for comparison
            output_text = request.raw_output
            if schema_result["parsed_data"] is not None:
                import json
                output_text = json.dumps(schema_result["parsed_data"])
            
            context_chunks = [request.context]
            faithfulness, _ = context_faithfulness(output_text, context_chunks)
            
            # Check faithfulness threshold
            if faithfulness < settings.threshold_faithfulness and failure_type is None:
                failure_type = FailureType.HALLUCINATION_DETECTED
                failure_reason = f"Faithfulness {faithfulness:.2f} below threshold {settings.threshold_faithfulness}"
        
        # === Pillar 5: LLM-as-a-Judge ===
        judge_score = None
        judge_reasoning = None
        
        if settings.groq_api_key:
            judge_result = await judge_response(
                response=request.raw_output,
                question=request.input,
                context=request.context,
                expected=request.ground_truth,
            )
            
            if judge_result["error"] is None:
                # Convert 0-1 score to 1-10 scale
                judge_score = int(judge_result["score"] * 10)
                judge_score = max(1, min(10, judge_score))  # Clamp to 1-10
                judge_reasoning = judge_result["reasoning"]
                
                # Check for low quality based on judge score
                if judge_score < 5 and failure_type is None:
                    failure_type = FailureType.LOW_QUALITY
                    failure_reason = f"Judge score {judge_score}/10: {judge_reasoning}"
        
        # === Check completeness threshold ===
        if completeness < settings.threshold_completeness and failure_type is None:
            failure_type = FailureType.INCOMPLETE_OUTPUT
            failure_reason = f"Completeness {completeness:.2f} below threshold {settings.threshold_completeness}"
        
        # === Build Metrics ===
        metrics = EvaluationMetrics(
            schema_valid=schema_valid,
            completeness=completeness,
            context_relevance=context_relevance,
            faithfulness=faithfulness,
            judge_score=judge_score,
            judge_reasoning=judge_reasoning,
        )
        
        # === Determine final status ===
        status = EvaluationStatus.FAILED if failure_type else EvaluationStatus.SUCCESS
        
        eval_time_ms = int((time.time() - eval_start) * 1000)
        
        return EvaluationResponse(
            job_id=request.job_id,
            run_id=request.run_id,
            task_item_id=request.task_item_id,
            prompt_variant_id=request.prompt_variant_id,
            model=request.model,
            repetition_index=request.repetition_index,
            status=status,
            metrics=metrics if status == EvaluationStatus.SUCCESS else None,
            failure_type=failure_type,
            failure_reason=failure_reason,
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
    # Pre-load embedding model for faster first request
    print(f"[Evaluator] Loading embedding model...")
    get_model()
    print(f"[Evaluator] Ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on shutdown."""
    print("[Evaluator] Shutting down...")
