"""
RAG Evaluator - Orchestrates all evaluation pillars

Combines:
- Pillar 1: Schema Validity (from schema_validator)
- Pillar 2: Completeness (from schema_validator)
- Pillar 3: Semantic Similarity (from embedder)
- Pillar 4: Context Faithfulness (from embedder)

This module provides the main evaluation function that calculates
all metrics and determines overall pass/fail status.
"""

from typing import Any

from schema_validator import validate_and_score
from embedder import semantic_similarity, context_faithfulness
from config import settings
from models import EvaluationMetrics, FailureType


def evaluate_rag_response(
    raw_output: str,
    expected_output: str | None = None,
    expected_schema: dict[str, Any] | None = None,
    context_chunks: list[str] | None = None,
) -> dict[str, Any]:
    """
    Evaluate an LLM response against all RAG quality pillars.
    
    Args:
        raw_output: The raw text output from the LLM
        expected_output: Optional expected/golden answer for similarity comparison
        expected_schema: Optional JSON schema to validate against
        context_chunks: Optional list of context passages for faithfulness check
    
    Returns:
        {
            "metrics": EvaluationMetrics,
            "passed": bool,
            "failure_type": FailureType | None,
            "failure_reason": str | None,
            "parsed_output": dict | None,
        }
    """
    # Initialize result structure
    result = {
        "metrics": None,
        "passed": True,
        "failure_type": None,
        "failure_reason": None,
        "parsed_output": None,
    }
    
    # === Pillar 1 & 2: Schema Validation & Completeness ===
    schema_result = validate_and_score(raw_output, expected_schema)
    
    schema_valid = schema_result["schema_valid"]
    completeness = schema_result["completeness"]
    result["parsed_output"] = schema_result["parsed_data"]
    
    # Check for schema failure
    if not schema_valid:
        if schema_result["parse_error"]:
            result["passed"] = False
            result["failure_type"] = FailureType.PARSE_ERROR
            result["failure_reason"] = schema_result["parse_error"]
        elif schema_result["validation_error"]:
            result["passed"] = False
            result["failure_type"] = FailureType.SCHEMA_VIOLATION
            result["failure_reason"] = schema_result["validation_error"]
    
    # === Pillar 3: Semantic Similarity ===
    similarity_score = 0.0
    
    if expected_output:
        # For JSON outputs, compare the string representations
        if result["parsed_output"] is not None:
            import json
            output_text = json.dumps(result["parsed_output"], indent=2)
        else:
            output_text = raw_output
        
        similarity_score = semantic_similarity(output_text, expected_output)
    
    # === Pillar 4: Context Faithfulness ===
    faithfulness_score = 0.0
    
    if context_chunks:
        # Use parsed output text or raw output
        if result["parsed_output"] is not None:
            import json
            output_text = json.dumps(result["parsed_output"], indent=2)
        else:
            output_text = raw_output
        
        faithfulness_score, _ = context_faithfulness(output_text, context_chunks)
    
    # === Build Metrics Object ===
    metrics = EvaluationMetrics(
        schema_valid=schema_valid,
        completeness=completeness,
        similarity_score=similarity_score,
        faithfulness_score=faithfulness_score,
        llm_judge_score=None,  # Computed separately by llm_judge.py
        latency_ms=0.0,  # Set by caller
    )
    
    result["metrics"] = metrics
    
    # === Determine Pass/Fail Based on Thresholds ===
    if result["passed"]:  # Only check thresholds if not already failed
        # Check similarity threshold (if expected output was provided)
        if expected_output and similarity_score < settings.similarity_threshold:
            result["passed"] = False
            result["failure_type"] = FailureType.LOW_SIMILARITY
            result["failure_reason"] = (
                f"Similarity score {similarity_score:.2f} below threshold "
                f"{settings.similarity_threshold}"
            )
        
        # Check faithfulness threshold (if context was provided)
        elif context_chunks and faithfulness_score < settings.faithfulness_threshold:
            result["passed"] = False
            result["failure_type"] = FailureType.LOW_FAITHFULNESS
            result["failure_reason"] = (
                f"Faithfulness score {faithfulness_score:.2f} below threshold "
                f"{settings.faithfulness_threshold}"
            )
        
        # Check completeness threshold
        elif completeness < settings.completeness_threshold:
            result["passed"] = False
            result["failure_type"] = FailureType.INCOMPLETE_OUTPUT
            result["failure_reason"] = (
                f"Completeness {completeness:.2f} below threshold "
                f"{settings.completeness_threshold}"
            )
    
    return result


def calculate_aggregate_score(metrics: EvaluationMetrics) -> float:
    """
    Calculate a single aggregate quality score from all metrics.
    
    Weighted average:
    - Schema valid: 20% (binary, 1.0 or 0.0)
    - Completeness: 20%
    - Similarity: 30%
    - Faithfulness: 20%
    - LLM Judge: 10%
    
    Returns:
        Float 0-1 representing overall quality
    """
    weights = {
        "schema_valid": 0.20,
        "completeness": 0.20,
        "similarity": 0.30,
        "faithfulness": 0.20,
        "llm_judge": 0.10,
    }
    
    score = 0.0
    total_weight = 0.0
    
    # Schema valid (binary)
    score += weights["schema_valid"] * (1.0 if metrics.schema_valid else 0.0)
    total_weight += weights["schema_valid"]
    
    # Completeness
    score += weights["completeness"] * metrics.completeness
    total_weight += weights["completeness"]
    
    # Similarity (only if computed)
    if metrics.similarity_score > 0:
        score += weights["similarity"] * metrics.similarity_score
        total_weight += weights["similarity"]
    
    # Faithfulness (only if computed)
    if metrics.faithfulness_score > 0:
        score += weights["faithfulness"] * metrics.faithfulness_score
        total_weight += weights["faithfulness"]
    
    # LLM Judge (only if computed)
    if metrics.llm_judge_score is not None:
        score += weights["llm_judge"] * metrics.llm_judge_score
        total_weight += weights["llm_judge"]
    
    # Normalize by actual weights used
    return score / total_weight if total_weight > 0 else 0.0


def quick_validate(raw_output: str, expected_schema: dict[str, Any] | None) -> bool:
    """
    Quick pass/fail check without computing embeddings.
    
    Useful for fast filtering before expensive embedding operations.
    
    Returns:
        True if output is valid JSON matching schema
    """
    result = validate_and_score(raw_output, expected_schema)
    return result["schema_valid"]
