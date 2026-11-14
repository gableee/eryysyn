import uuid
from dataclasses import dataclass

from app.db.session import pool
from app.rag.embed import embed_query
from app.rag.models import EMBEDDING_MODEL
from app.services.indexing import _vector_literal

DEFAULT_K = 5


@dataclass(frozen=True)
class SearchHit:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    page: int
    text: str
    score: float  # cosine similarity: higher = closer. Compare ranks and gaps, not the raw number.


def search_chunks(workspace_id: uuid.UUID, question: str, k: int = DEFAULT_K) -> list[SearchHit]:
    """Return the k chunks closest to the question, from ONE workspace only.

    The caller must already have verified that the user owns workspace_id.
    """
    query_vector = _vector_literal(embed_query(question))

    with pool.connection() as conn:
        # With a WHERE filter, HNSW could return fewer than k rows. This lets it keep
        # scanning until it has k matches that pass the filter (pgvector >= 0.8).
        conn.execute("set local hnsw.iterative_scan = strict_order")
        rows = conn.execute(
            "select c.id, c.document_id, d.filename, c.page, c.text, "
            "       1 - (c.embedding <=> %s::vector) as score "
            "from chunks c join documents d on d.id = c.document_id "
            "where c.workspace_id = %s "          # the ownership wall: always present
            "  and c.embedding_model = %s "       # never compare vectors from different models
            "order by c.embedding <=> %s::vector "
            "limit %s",
            (query_vector, workspace_id, EMBEDDING_MODEL, query_vector, k),
        ).fetchall()

    return [SearchHit(*row) for row in rows]
