"""
Configuration management for the Evaluator service.
Loads from environment variables with sensible defaults.
"""

import os
from functools import lru_cache


class Settings:
    """Application settings loaded from environment."""

    def __init__(self):
        # Server
        self.host: str = os.getenv("HOST", "0.0.0.0")
        self.port: int = int(os.getenv("PORT", "8000"))
        self.debug: bool = os.getenv("DEBUG", "false").lower() == "true"

        # Database (for pgvector operations)
        self.database_url: str = os.getenv(
            "DATABASE_URL", "postgresql://evalx:evalx@localhost:5432/evalx"
        )

        # LLM-as-a-Judge (Groq - FREE tier)
        self.groq_api_key: str | None = os.getenv("GROQ_API_KEY")
        self.judge_model: str = os.getenv("JUDGE_MODEL", "llama-3.3-70b-versatile")

        # Embedding model (local, no API needed)
        self.embedding_model: str = os.getenv(
            "EMBEDDING_MODEL", "all-MiniLM-L6-v2"
        )
        self.embedding_dim: int = 384  # Fixed for all-MiniLM-L6-v2

        # Evaluation thresholds (from spec)
        self.threshold_completeness: float = 0.5
        self.threshold_faithfulness: float = 0.4
        self.threshold_judge_score: int = 4


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Use this instead of creating Settings() directly.
    """
    return Settings()
