import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_id
from app.db.session import pool
from app.services.retrieval import DEFAULT_K, search_chunks

router = APIRouter(tags=["search"])


class SearchRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    k: int = Field(default=DEFAULT_K, ge=1, le=20)


@router.post("/workspaces/{workspace_id}/search")
def search(
    workspace_id: uuid.UUID,
    body: SearchRequest,
    user_id: str = Depends(get_current_user_id),
):
    # ownership check first: 404 (not 403) so we don't reveal that the workspace exists
    with pool.connection() as conn:
        owned = conn.execute(
            "select 1 from workspaces where id = %s and owner_id = %s",
            (workspace_id, user_id),
        ).fetchone()
    if not owned:
        raise HTTPException(404, "Workspace not found")

    hits = search_chunks(workspace_id, body.question, body.k)
    return [
        {
            "chunk_id": str(h.chunk_id),
            "document_id": str(h.document_id),
            "filename": h.filename,
            "page": h.page,
            "score": round(h.score, 4),
            "text": h.text,
        }
        for h in hits
    ]
