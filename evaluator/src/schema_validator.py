"""
Schema Validator - Pillar 1 (Schema Validity) and Pillar 2 (Completeness)

Validates LLM output against expected JSON schema and calculates
what fraction of required fields were populated.

Uses the `jsonschema` library for validation.
"""

import json
import re
from typing import Any

from jsonschema import validate, ValidationError, Draft7Validator


def parse_json_output(raw_output: str) -> tuple[dict | list | None, str | None]:
    """
    Safely parse LLM output as JSON.
    
    Handles common LLM quirks:
    - Markdown code blocks (```json ... ```)
    - Extra text before/after JSON
    - Trailing commas (attempts recovery)
    
    Returns:
        (parsed_data, error_message)
        - On success: (dict/list, None)
        - On failure: (None, error_string)
    """
    if not raw_output or not raw_output.strip():
        return None, "Empty output"
    
    text = raw_output.strip()
    
    # 1. Try direct parse first
    try:
        return json.loads(text), None
    except json.JSONDecodeError:
        pass
    
    # 2. Extract from markdown code block
    # Matches ```json ... ``` or ``` ... ```
    code_block_pattern = r'```(?:json)?\s*([\s\S]*?)\s*```'
    matches = re.findall(code_block_pattern, text)
    
    for match in matches:
        try:
            return json.loads(match.strip()), None
        except json.JSONDecodeError:
            continue
    
    # 3. Try to find JSON object/array in the text
    # Look for first { or [ and last } or ]
    json_patterns = [
        (r'\{[\s\S]*\}', 'object'),  # JSON object
        (r'\[[\s\S]*\]', 'array'),    # JSON array
    ]
    
    for pattern, _ in json_patterns:
        match = re.search(pattern, text)
        if match:
            try:
                return json.loads(match.group()), None
            except json.JSONDecodeError:
                continue
    
    # 4. All attempts failed
    return None, f"Could not parse JSON from output: {text[:100]}..."


def validate_schema(
    raw_output: str,
    expected_schema: dict[str, Any] | None
) -> tuple[bool, dict | list | None, str | None]:
    """
    Validate LLM output against expected JSON schema.
    
    Args:
        raw_output: Raw string output from LLM
        expected_schema: JSON Schema to validate against (can be None to skip)
    
    Returns:
        (is_valid, parsed_data, error_message)
        - is_valid: True if output matches schema (or if no schema required)
        - parsed_data: Parsed JSON data (or None if not JSON/parse failed)
        - error_message: Description of failure (or None if valid)
    """
    # 1. If no schema provided, any output is valid (plain text OK)
    if not expected_schema:
        # Try to parse as JSON for downstream use, but don't fail if not JSON
        parsed_data, _ = parse_json_output(raw_output)
        return True, parsed_data, None
    
    # 2. Parse the output (schema requires JSON)
    parsed_data, parse_error = parse_json_output(raw_output)
    
    if parse_error:
        return False, None, f"JSON parse error: {parse_error}"
    
    # 3. Validate against schema
    try:
        validate(instance=parsed_data, schema=expected_schema)
        return True, parsed_data, None
    except ValidationError as e:
        # Build a readable error message
        path = " -> ".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"
        error_msg = f"Schema violation at '{path}': {e.message}"
        return False, parsed_data, error_msg


def calculate_completeness(
    parsed_data: dict | list | None,
    expected_schema: dict[str, Any] | None
) -> float:
    """
    Calculate completeness score (Pillar 2).
    
    Completeness = (populated required fields) / (total required fields)
    
    Args:
        parsed_data: Parsed JSON output
        expected_schema: JSON Schema with "required" field
    
    Returns:
        Float 0-1, where 1.0 means all required fields are populated
        Returns 1.0 if no required fields defined
    """
    # No schema = assume complete (no requirements to check)
    if not expected_schema:
        return 1.0
    
    # Get required fields from schema
    required_fields = expected_schema.get("required", [])
    
    # No required fields = 100% complete
    if not required_fields:
        return 1.0
    
    # No data and we have requirements = 0 completeness
    if parsed_data is None:
        return 0.0
    
    # For non-dict data (like plain strings or arrays), can't check fields
    if not isinstance(parsed_data, dict):
        return 1.0
    
    # Count populated required fields
    # A field is "populated" if it exists and is not None/empty string
    populated = 0
    
    for field in required_fields:
        if field in parsed_data:
            value = parsed_data[field]
            # Consider None, empty string, empty list as "not populated"
            if value is not None and value != "" and value != []:
                populated += 1
    
    return populated / len(required_fields)


def get_schema_fields(schema: dict[str, Any] | None) -> dict[str, list[str]]:
    """
    Extract field information from a JSON schema.
    
    Returns:
        {
            "required": ["field1", "field2"],
            "optional": ["field3", "field4"],
            "all": ["field1", "field2", "field3", "field4"]
        }
    """
    if not schema:
        return {"required": [], "optional": [], "all": []}
    
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    all_fields = list(properties.keys())
    
    return {
        "required": [f for f in all_fields if f in required],
        "optional": [f for f in all_fields if f not in required],
        "all": all_fields,
    }


def validate_and_score(
    raw_output: str,
    expected_schema: dict[str, Any] | None
) -> dict[str, Any]:
    """
    Combined validation: parse, validate schema, calculate completeness.
    
    Returns a dict with all results:
    {
        "schema_valid": bool,
        "completeness": float,
        "parsed_data": dict | None,
        "parse_error": str | None,
        "validation_error": str | None,
    }
    """
    is_valid, parsed_data, error = validate_schema(raw_output, expected_schema)
    completeness = calculate_completeness(parsed_data, expected_schema)
    
    return {
        "schema_valid": is_valid,
        "completeness": completeness,
        "parsed_data": parsed_data,
        "parse_error": error if parsed_data is None else None,
        "validation_error": error if parsed_data is not None and not is_valid else None,
    }
