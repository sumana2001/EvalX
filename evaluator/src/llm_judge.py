"""
LLM Judge - Pillar 5: LLM-as-a-Judge evaluation

Uses Groq's free tier (Llama-3) to evaluate response quality.
The LLM scores the response on a structured rubric covering:
- Correctness: Is the answer factually correct?
- Relevance: Does it address the question?
- Coherence: Is it well-structured and clear?

Returns a score 0-1 based on the judge's assessment.
"""

import json
import re
import time
from typing import Any

from groq import Groq, RateLimitError, APIError

from .config import get_settings

# Initialize settings using get_settings()
settings = get_settings()


# Groq client (lazy initialized)
_client: Groq | None = None


def get_client() -> Groq:
    """Get or create Groq client."""
    global _client
    if _client is None:
        _client = Groq(api_key=settings.groq_api_key)
    return _client


# Judge prompt template
JUDGE_PROMPT = """You are an expert evaluator assessing the quality of an AI assistant's response.

## Task
Evaluate the following response based on the criteria below. Be strict but fair.

## Context Provided to the Assistant
{context}

## Question/Prompt Given to the Assistant
{question}

## Assistant's Response
{response}

## Expected Answer (if available)
{expected}

## Evaluation Criteria
Score each criterion from 0-10:

1. **Correctness** (0-10): Is the response factually accurate? Does it contain errors or hallucinations?
2. **Relevance** (0-10): Does the response directly address the question? Is it on-topic?
3. **Completeness** (0-10): Does it provide a thorough answer without missing key information?
4. **Coherence** (0-10): Is the response well-organized, clear, and easy to understand?

## Response Format
Respond ONLY with a JSON object in this exact format (no other text):
{{
  "correctness": <0-10>,
  "relevance": <0-10>,
  "completeness": <0-10>,
  "coherence": <0-10>,
  "reasoning": "<brief explanation of scores>"
}}
"""


def parse_judge_response(text: str) -> dict[str, Any] | None:
    """
    Parse the LLM judge response to extract scores.
    
    Handles common LLM quirks like markdown code blocks.
    
    Returns:
        Dict with scores, or None if parsing fails
    """
    # Try to extract JSON from the response
    # Handle markdown code blocks
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if json_match:
        text = json_match.group(1)
    
    # Try direct JSON parse
    try:
        data = json.loads(text.strip())
        
        # Validate required fields
        required = ["correctness", "relevance", "completeness", "coherence"]
        for field in required:
            if field not in data:
                return None
            # Ensure scores are numbers in valid range
            score = data[field]
            if not isinstance(score, (int, float)) or score < 0 or score > 10:
                return None
        
        return data
    except json.JSONDecodeError:
        return None


def calculate_judge_score(scores: dict[str, Any]) -> float:
    """
    Calculate weighted average score from individual criteria.
    
    Weights:
    - Correctness: 40% (most important)
    - Relevance: 25%
    - Completeness: 20%
    - Coherence: 15%
    
    Returns:
        Float 0-1
    """
    weights = {
        "correctness": 0.40,
        "relevance": 0.25,
        "completeness": 0.20,
        "coherence": 0.15,
    }
    
    total = 0.0
    for criterion, weight in weights.items():
        # Scores are 0-10, normalize to 0-1
        total += (scores[criterion] / 10.0) * weight
    
    return total


async def judge_response(
    response: str,
    question: str,
    context: str | None = None,
    expected: str | None = None,
    max_retries: int = 3,
) -> dict[str, Any]:
    """
    Use LLM-as-a-Judge to evaluate a response.
    
    Args:
        response: The LLM response to evaluate
        question: The original question/prompt
        context: Optional context provided to the LLM
        expected: Optional expected/golden answer
        max_retries: Maximum retry attempts for rate limits
    
    Returns:
        {
            "score": float 0-1,
            "scores": {correctness, relevance, completeness, coherence},
            "reasoning": str,
            "error": str | None,
        }
    """
    result = {
        "score": 0.0,
        "scores": None,
        "reasoning": None,
        "error": None,
    }
    
    # Skip if no API key configured
    if not settings.groq_api_key:
        result["error"] = "GROQ_API_KEY not configured"
        return result
    
    # Build the prompt
    prompt = JUDGE_PROMPT.format(
        context=context or "No context provided",
        question=question,
        response=response,
        expected=expected or "No expected answer provided",
    )
    
    # Call Groq with retry logic
    client = get_client()
    last_error = None
    
    for attempt in range(max_retries):
        try:
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",  # Fast, free tier model
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert evaluator. Respond only with valid JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,  # Low temp for consistent scoring
                max_tokens=500,
            )
            
            judge_text = completion.choices[0].message.content
            
            # Parse the response
            scores = parse_judge_response(judge_text)
            
            if scores is None:
                result["error"] = f"Failed to parse judge response: {judge_text[:200]}"
                return result
            
            # Calculate final score
            result["score"] = calculate_judge_score(scores)
            result["scores"] = {
                "correctness": scores["correctness"],
                "relevance": scores["relevance"],
                "completeness": scores["completeness"],
                "coherence": scores["coherence"],
            }
            result["reasoning"] = scores.get("reasoning", "")
            
            return result
            
        except RateLimitError as e:
            last_error = e
            # Exponential backoff with jitter
            wait_time = (2 ** attempt) + (time.time() % 1)  # 1-2s, 2-4s, 4-8s
            time.sleep(wait_time)
            continue
            
        except APIError as e:
            result["error"] = f"Groq API error: {str(e)}"
            return result
            
        except Exception as e:
            result["error"] = f"Unexpected error: {str(e)}"
            return result
    
    # All retries exhausted
    result["error"] = f"Rate limited after {max_retries} attempts: {str(last_error)}"
    return result


def judge_response_sync(
    response: str,
    question: str,
    context: str | None = None,
    expected: str | None = None,
    max_retries: int = 3,
) -> dict[str, Any]:
    """
    Synchronous version of judge_response for non-async contexts.
    """
    import asyncio
    return asyncio.run(judge_response(
        response=response,
        question=question,
        context=context,
        expected=expected,
        max_retries=max_retries,
    ))
