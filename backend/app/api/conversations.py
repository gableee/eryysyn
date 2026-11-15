"""HTTP endpoints for chats. Thin on purpose: check ownership, call the service, shape the JSON."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_id
from app.db.session import pool
from app.llm.client import LLMError
from app.services.chat import answer_question

router = APIRouter(tags=["conversations"])


class ConversationCreate(BaseModel):
    instructions: str = Field(default="", max_length=500)


class ConversationUpdate(BaseModel):
    # None = "the client did not send this field" = leave it unchanged
    title: str | None = Field(default=None, min_length=1, max_length=200)
    instructions: str | None = Field(default=None, max_length=500)


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


def _require_workspace(conn, workspace_id: uuid.UUID, user_id: str) -> None:
    """404 (not 403) so we don't reveal that the workspace exists."""
    owned = conn.execute(
        "select 1 from workspaces where id = %s and owner_id = %s",
        (workspace_id, user_id),
    ).fetchone()
    if not owned:
        raise HTTPException(404, "Workspace not found")


def _require_conversation(conn, conversation_id: uuid.UUID, user_id: str) -> tuple[uuid.UUID, str]:
    """Return (workspace_id, instructions) if the user owns the chat, else 404.

    A conversation has no owner column. Ownership comes from its workspace, so we join.
    Every conversation endpoint calls this first: it is the ownership wall.
    """
    row = conn.execute(
        "select c.workspace_id, c.instructions from conversations c "
        "join workspaces w on w.id = c.workspace_id "
        "where c.id = %s and w.owner_id = %s",
        (conversation_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return row[0], row[1]


def _conversation_json(row) -> dict:
    return {"id": str(row[0]), "title": row[1], "instructions": row[2], "created_at": row[3]}


def _citation_json(n, chunk_id, document_id, filename, page, excerpt) -> dict:
    return {
        "n": n,
        "chunk_id": str(chunk_id) if chunk_id else None,           # None = chunk gone (deleted or re-indexed)
        "document_id": str(document_id) if document_id else None,  # None = source removed
        "filename": filename,
        "page": page,
        "excerpt": excerpt,
    }


@router.post("/workspaces/{workspace_id}/conversations", status_code=201)
def create_conversation(
    workspace_id: uuid.UUID,
    body: ConversationCreate,
    user_id: str = Depends(get_current_user_id),
):
    with pool.connection() as conn:
        _require_workspace(conn, workspace_id, user_id)
        row = conn.execute(
            "insert into conversations (workspace_id, instructions) values (%s, %s) "
            "returning id, title, instructions, created_at",
            (workspace_id, body.instructions),
        ).fetchone()
    return _conversation_json(row)


@router.get("/workspaces/{workspace_id}/conversations")
def list_conversations(
    workspace_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    with pool.connection() as conn:
        _require_workspace(conn, workspace_id, user_id)
        rows = conn.execute(
            "select id, title, created_at from conversations "
            "where workspace_id = %s order by created_at desc",
            (workspace_id,),
        ).fetchall()
    return [{"id": str(r[0]), "title": r[1], "created_at": r[2]} for r in rows]


@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    with pool.connection() as conn:
        _require_conversation(conn, conversation_id, user_id)
        conv = conn.execute(
            "select id, title, instructions, created_at from conversations where id = %s",
            (conversation_id,),
        ).fetchone()
        messages = conn.execute(
            "select id, role, content, refused, created_at from messages "
            "where conversation_id = %s order by seq",       # seq, not created_at: see migration 002
            (conversation_id,),
        ).fetchall()
        citations = conn.execute(
            "select mc.message_id, mc.n, mc.chunk_id, mc.document_id, mc.filename, mc.page, mc.excerpt "
            "from message_citations mc join messages m on m.id = mc.message_id "
            "where m.conversation_id = %s order by mc.n",
            (conversation_id,),
        ).fetchall()

    # Group citations under their message: {message_id: [citation, ...]}
    by_message: dict[uuid.UUID, list[dict]] = {}
    for message_id, *fields in citations:
        by_message.setdefault(message_id, []).append(_citation_json(*fields))

    return {
        **_conversation_json(conv),
        "messages": [
            {
                "id": str(m[0]),
                "role": m[1],
                "content": m[2],
                "refused": m[3],
                "created_at": m[4],
                "citations": by_message.get(m[0], []),
            }
            for m in messages
        ],
    }


@router.patch("/conversations/{conversation_id}")
def update_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    user_id: str = Depends(get_current_user_id),
):
    with pool.connection() as conn:
        _require_conversation(conn, conversation_id, user_id)
        # coalesce(new, old): when the client did not send a field, new is NULL and the old value stays.
        row = conn.execute(
            "update conversations set title = coalesce(%s, title), "
            "instructions = coalesce(%s, instructions) "
            "where id = %s returning id, title, instructions, created_at",
            (body.title, body.instructions, conversation_id),
        ).fetchone()
    return _conversation_json(row)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    with pool.connection() as conn:
        _require_conversation(conn, conversation_id, user_id)
        # messages and their citations go with it (on delete cascade)
        conn.execute("delete from conversations where id = %s", (conversation_id,))


@router.post("/conversations/{conversation_id}/messages", status_code=201)
def ask_question(
    conversation_id: uuid.UUID,
    body: QuestionRequest,
    user_id: str = Depends(get_current_user_id),
):
    # Ownership check in its own short block: the connection goes back to the pool
    # BEFORE the slow model call, so a 30-second answer does not hold a DB connection.
    with pool.connection() as conn:
        workspace_id, instructions = _require_conversation(conn, conversation_id, user_id)

    try:
        result = answer_question(conversation_id, workspace_id, instructions, body.question)
    except LLMError:
        # 502 Bad Gateway = "a service I depend on failed". Nothing was saved.
        raise HTTPException(502, "The model is not available. Try again.")

    return {
        "message_id": str(result.message_id),
        "answer": result.answer,
        "refused": result.refused,
        "citations": [
            _citation_json(c.n, c.chunk_id, c.document_id, c.filename, c.page, c.excerpt)
            for c in result.citations
        ],
    }
