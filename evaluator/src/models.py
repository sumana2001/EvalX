"""
Pydantic models for the Evaluator API.

These define the structure for:
- Evaluation requests (from Worker via Kafka or direct HTTP)
- Evaluation responses (the 5 pillars + failure classification)
"""

from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field
from enum import Enum


# ============================================================
# Enums
# ============================================================

class FailureType(str, Enum):
    """Failure classification types from spec."""
    SCHEMA_VIOLATION = "SCHEMA_VIOLATION"
    INCOMPLETE_OUTPUT = "INCOMPLETE_OUTPUT"
    HALLUCINATION_DETECTED = "HALLUCINATION_DETECTED"
    LOW_QUALITY = "LOW_QUALITY"
    TIMEOUT = "TIMEOUT"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    EVALUATOR_ERROR = "EVALUATOR_ERROR"


class EvaluationStatus(str, Enum):
    """Evaluation result status."""
    SUCCESS = "success"
    FAILED = "failed"


# ============================================================
# Request Models
# ============================================================

class EvaluationRequest(BaseModel):
    """
    Request to evaluate an LLM output.
    Contains everything needed to score the response.
    """
    # Job identification
    job_id: str = "unknown"
    run_id: str = "unknown"
    task_item_id: str = "unknown"
    prompt_variant_id: str = "unknown"
    model: str = "unknown"
    repetition_index: int = 1

    # The LLM's raw output to evaluate
    raw_output: str

    # Context needed for evaluation (all optional)
    expected_schema: Optional[Dict[str, Any]] = None
    ground_truth: Optional[str] = None
    context: Optional[str] = None
    input: Optional[str] = None

    # Performance metrics (optional - passed through for logging)
    latency_ms: Optional[int] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: Optional[float] = None
    provider: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "run_id": "550e8400-e29b-41d4-a716-446655440001",
                "task_item_id": "550e8400-e29b-41d4-a716-446655440002",
                "prompt_variant_id": "550e8400-e29b-41d4-a716-446655440003",
                "model": "llama-3.3-70b",
                "raw_output": '{"answer": "Paris", "confidence": 0.95}',
                "expected_schema": {
                    "type": "object",
                    "properties": {"answer": {"type": "string"}},
                    "required": ["answer"]
                },
                "ground_truth": "Paris",
                "context": "France is a country in Europe. Paris is the capital.",
                "input": "What is the capital of France?",
                "latency_ms": 245,
                "provider": "groq"
            }
        }


# ============================================================
# Response Models
# ============================================================

class EvaluationMetrics(BaseModel):
    """
    The 5 Pillars of evaluation from spec.
    All scores are 0-1 except judge_score (1-10).
    """
    # Pillar 1: Schema Validity
    schema_valid: bool = Field(
        description="True if output is valid JSON matching expected_schema"
    )

    # Pillar 2: Completeness
    completeness: float = Field(
        ge=0, le=1,
        description="Fraction of required schema fields populated (0-1)"
    )

    # Pillar 3: Context Relevance
    context_relevance: Optional[float] = Field(
        default=None, ge=0, le=1,
        description="Cosine similarity between input and context (0-1)"
    )

    # Pillar 4: RAG Faithfulness
    faithfulness: Optional[float] = Field(
        default=None, ge=0, le=1,
        description="How grounded the answer is in the context (0-1)"
    )

    # Pillar 5: LLM-as-a-Judge
    judge_score: Optional[int] = Field(
        default=None, ge=1, le=10,
        description="LLM judge score for correctness/clarity (1-10)"
    )
    judge_reasoning: Optional[str] = Field(
        default=None,
        description="Explanation from the judge model"
    )


class EvaluationResponse(BaseModel):
    """
    Complete evaluation result.
    Includes metrics, failure classification, and pass-through data.
    """
    # Job identification (echoed back)
    job_id: str
    run_id: str
    task_item_id: str
    prompt_variant_id: str
    model: str
    repetition_index: int

    # Evaluation status
    status: EvaluationStatus

    # The 5 pillars (null on failure)
    metrics: Optional[EvaluationMetrics] = None

    # Failure info (null on success)
    failure_type: Optional[FailureType] = None
    failure_reason: Optional[str] = None

    # Pass-through performance data
    latency_ms: Optional[int] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: Optional[float] = None

    # Raw output (for debugging)
    raw_output: str

    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "run_id": "550e8400-e29b-41d4-a716-446655440001",
                "task_item_id": "550e8400-e29b-41d4-a716-446655440002",
                "prompt_variant_id": "550e8400-e29b-41d4-a716-446655440003",
                "model": "llama-3.3-70b",
                "repetition_index": 1,
                "status": "success",
                "metrics": {
                    "schema_valid": True,
                    "completeness": 1.0,
                    "context_relevance": 0.85,
                    "faithfulness": 0.92,
                    "judge_score": 8,
                    "judge_reasoning": "Answer is correct and well-grounded."
                },
                "latency_ms": 245,
                "prompt_tokens": 50,
                "completion_tokens": 20,
                "total_tokens": 70,
                "estimated_cost_usd": 0.00005,
                "raw_output": '{"answer": "Paris", "confidence": 0.95}'
            }
        }


# ============================================================
# Health Check Models
# ============================================================

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str
    embedding_model: Optional[str] = None
    judge_available: bool = False
