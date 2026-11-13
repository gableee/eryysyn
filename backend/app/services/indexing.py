import logging
import uuid

from app.core.storage import BUCKET, supabase
from app.db.session import pool
from app.rag.chunk import chunk_pages
from app.rag.embed import embed_passages
from app.rag.extract import extract_pages
from app.rag.models import EMBEDDING_MODEL

log = logging.getLogger(__name__)


def _vector_literal(vector: list[float]) -> str:
    """pgvector accepts text like '[0.1,0.2,...]' and we cast it with ::vector in SQL."""
    return "[" + ",".join(f"{x:.8f}" for x in vector) + "]"


def index_document(document_id: uuid.UUID, workspace_id: uuid.UUID, pdf_bytes: bytes) -> None:
    """extract -> chunk -> embed -> store. All or nothing: any error leaves no chunks behind.

    Raises on failure. Callers decide what to do (the upload endpoint marks the document 'failed').
    """
    pages = extract_pages(pdf_bytes)
    chunks = chunk_pages(pages)
    if not chunks:
        raise ValueError("No extractable text (scanned PDF? OCR is not supported yet)")

    # The slow part runs BEFORE we open a transaction, so we don't hold a DB connection while embedding.
    vectors = embed_passages([c.text for c in chunks])

    rows = [
        (
            document_id,
            workspace_id,
            c.page,
            c.chunk_index,
            c.text,
            _vector_literal(v),
            EMBEDDING_MODEL,
        )
        for c, v in zip(chunks, vectors)
    ]

    # One transaction: it commits only if every statement succeeds, otherwise it rolls back.
    with pool.connection() as conn:
        conn.execute("delete from chunks where document_id = %s", (document_id,))  # re-index = replace
        with conn.cursor() as cur:
            cur.executemany(
                "insert into chunks "
                "(document_id, workspace_id, page, chunk_index, text, embedding, embedding_model) "
                "values (%s, %s, %s, %s, %s, %s::vector, %s)",
                rows,
            )
        conn.execute("update documents set status = 'indexed' where id = %s", (document_id,))


def index_from_storage(document_id: uuid.UUID, workspace_id: uuid.UUID, storage_path: str) -> str:
    """Download the original, index it, and return the final status ('indexed' or 'failed')."""
    try:
        pdf_bytes = supabase.storage.from_(BUCKET).download(storage_path)
        index_document(document_id, workspace_id, pdf_bytes)
        return "indexed"
    except Exception:
        log.exception("indexing failed for document %s", document_id)
        with pool.connection() as conn:
            conn.execute("update documents set status = 'failed' where id = %s", (document_id,))
        return "failed"
