from functools import lru_cache

from sentence_transformers import SentenceTransformer

from app.rag.models import EMBEDDING_MODEL

# bge needs this prefix on QUESTIONS only (not on chunks). Skipping it silently lowers quality.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


@lru_cache(maxsize=1)
def _model() -> SentenceTransformer:
    # Loaded once, on first use. Uses the GPU if there is one, otherwise the CPU.
    return SentenceTransformer(EMBEDDING_MODEL)


def embed_passages(texts: list[str]) -> list[list[float]]:
    """Embed chunk texts. Vectors are normalized, so cosine similarity = dot product."""
    vectors = _model().encode(texts, normalize_embeddings=True, batch_size=32)
    return vectors.tolist()


def embed_query(question: str) -> list[float]:
    """Embed a user question (with the bge query prefix)."""
    vector = _model().encode(QUERY_PREFIX + question, normalize_embeddings=True)
    return vector.tolist()
