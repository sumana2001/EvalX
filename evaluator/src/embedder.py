"""
Embedder - Text embedding using sentence-transformers

Provides embedding generation for semantic similarity calculations.
Uses all-MiniLM-L6-v2 (384 dimensions) for fast, lightweight embeddings.

The model is loaded lazily on first use and cached for subsequent calls.
"""

import numpy as np
from numpy.typing import NDArray
from functools import lru_cache
from sentence_transformers import SentenceTransformer

from config import settings


# Module-level model cache
_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    """
    Get or initialize the embedding model (lazy loading).
    
    The model is cached after first load to avoid repeated initialization.
    Downloads the model from HuggingFace on first run (~90MB).
    """
    global _model
    
    if _model is None:
        _model = SentenceTransformer(settings.embedding_model)
    
    return _model


def embed_text(text: str) -> NDArray[np.float32]:
    """
    Generate embedding vector for a single text.
    
    Args:
        text: Input text to embed
        
    Returns:
        NumPy array of shape (384,) for all-MiniLM-L6-v2
    """
    model = get_model()
    # Returns shape (384,) for single input
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding.astype(np.float32)


def embed_texts(texts: list[str]) -> NDArray[np.float32]:
    """
    Generate embeddings for multiple texts (batched for efficiency).
    
    Args:
        texts: List of texts to embed
        
    Returns:
        NumPy array of shape (n, 384) where n = len(texts)
    """
    if not texts:
        return np.array([], dtype=np.float32)
    
    model = get_model()
    # Returns shape (n, 384) for batch input
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return embeddings.astype(np.float32)


def cosine_similarity(vec_a: NDArray[np.float32], vec_b: NDArray[np.float32]) -> float:
    """
    Calculate cosine similarity between two vectors.
    
    Args:
        vec_a: First embedding vector
        vec_b: Second embedding vector
        
    Returns:
        Float in range [-1, 1], where 1 = identical direction
    """
    # Handle zero vectors
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))


def semantic_similarity(text_a: str, text_b: str) -> float:
    """
    Calculate semantic similarity between two texts.
    
    This is the primary function for Pillar 3 (Semantic Similarity).
    
    Args:
        text_a: First text (e.g., LLM output)
        text_b: Second text (e.g., expected answer)
        
    Returns:
        Float in range [0, 1], where 1 = semantically identical
        (Clipped to 0-1 range since cosine can be negative)
    """
    if not text_a or not text_b:
        return 0.0
    
    # Batch encode both texts for efficiency
    embeddings = embed_texts([text_a, text_b])
    
    similarity = cosine_similarity(embeddings[0], embeddings[1])
    
    # Clip to [0, 1] - negative similarity treated as 0
    return max(0.0, min(1.0, similarity))


def context_faithfulness(
    response: str,
    context_chunks: list[str]
) -> tuple[float, list[float]]:
    """
    Calculate how faithful a response is to the provided context.
    
    This is used for Pillar 4 (RAG Faithfulness).
    
    Measures maximum similarity between response and any context chunk.
    High score = response is grounded in the provided context.
    
    Args:
        response: LLM response text
        context_chunks: List of context passages provided to the LLM
        
    Returns:
        (max_similarity, all_similarities)
        - max_similarity: Highest similarity to any chunk (0-1)
        - all_similarities: List of similarities to each chunk
    """
    if not response or not context_chunks:
        return 0.0, []
    
    # Embed response and all context chunks together
    all_texts = [response] + context_chunks
    embeddings = embed_texts(all_texts)
    
    response_embedding = embeddings[0]
    context_embeddings = embeddings[1:]
    
    # Calculate similarity to each chunk
    similarities = [
        max(0.0, cosine_similarity(response_embedding, ctx_emb))
        for ctx_emb in context_embeddings
    ]
    
    max_sim = max(similarities) if similarities else 0.0
    
    return max_sim, similarities


def embedding_dimension() -> int:
    """
    Get the embedding dimension for the current model.
    
    Returns:
        384 for all-MiniLM-L6-v2
    """
    model = get_model()
    return model.get_sentence_embedding_dimension()
