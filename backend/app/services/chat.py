"""Answer one question inside a chat: retrieve -> prompt -> model -> validate -> save.

Two parts:
  draft_answer()   = everything up to the validated answer. Saves nothing.
                     Also used by scripts/try_chat.py, so the debugging tool runs the SAME pipeline.
  answer_question() = draft_answer() + save in one transaction.
"""

import logging
import uuid
from dataclasses import dataclass

from app.db.session import pool
from app.llm import client as llm   # the MODULE, not the function: tests swap llm.generate for a fake
from app.rag.citations import ParsedAnswer, parse_answer
from app.rag.prompt import REFUSAL, build_prompt
from app.rag import rewrite
from app.rag.rewrite import HISTORY_TURNS, History, build_rewrite_prompt, clean_rewrite
from app.services.retrieval import DEFAULT_K, SearchHit, search_chunks

log = logging.getLogger(__name__)


class ConversationGone(Exception):
    """The chat was deleted while its answer was being written. Nothing was saved."""


@dataclass(frozen=True)
class Citation:
    n: int                          # the [n] in the answer text
    chunk_id: uuid.UUID | None      # None once the chunk is gone (document deleted or re-indexed)
    document_id: uuid.UUID | None   # None once the document is deleted = "source removed"
    filename: str
    page: int
    excerpt: str                    # the passage text the model was shown


@dataclass(frozen=True)
class ChatResult:
    message_id: uuid.UUID
    answer: str
    refused: bool
    citations: list[Citation]
    search_question: str            # the complete question that was searched and answered


@dataclass(frozen=True)
class Draft:
    """Every stage of one answer, before saving. The script prints all of it."""
    hits: list[SearchHit]
    system: str | None    # None when the model was not called (empty workspace)
    user: str | None
    raw: str | None       # the model's reply exactly as written
    parsed: ParsedAnswer  # after our checks


def draft_answer(
    workspace_id: uuid.UUID, question: str, instructions: str = "", k: int = DEFAULT_K,
    search_query: str | None = None,
) -> Draft:
    """Retrieve, build the prompt, call the model, validate. Saves nothing.

    search_query: what to search for, when it differs from what the model is asked. Only the eval's
    "concat" baseline uses it; the chat searches and asks the same complete question.
    The caller must already have verified that the user owns workspace_id.
    Raises LLMError if the model fails.
    """
    hits = search_chunks(workspace_id, search_query or question, k)   # k = passages the model will see
    if not hits:
        # No documents: the answer is known. Don't spend a model call on it.
        return Draft(hits, None, None, None, ParsedAnswer(text=REFUSAL, cited=[], refused=True))

    system, user = build_prompt(question, hits, instructions)
    raw = llm.generate(system, user)             # slow (seconds). May raise LLMError.
    return Draft(hits, system, user, raw, parse_answer(raw, len(hits)))


def load_history(conn, conversation_id: uuid.UUID) -> History:
    """The rewriter's window: the last HISTORY_TURNS complete questions (oldest first). The newest answer
    (unless refused) only while rewrite.INCLUDE_ANSWER is on; it is off (eval f11), so it is not even read.
    The caller must already own conversation_id."""
    rows = conn.execute(
        # coalesce: rows saved before migration 004 have no complete question, so use what was typed.
        "select coalesce(standalone_question, content) from messages "
        "where conversation_id = %s and role = 'user' order by seq desc limit %s",
        (conversation_id, HISTORY_TURNS),
    ).fetchall()
    last = conn.execute(
        "select content, refused from messages "
        "where conversation_id = %s and role = 'assistant' order by seq desc limit 1",
        (conversation_id,),
    ).fetchone() if rewrite.INCLUDE_ANSWER else None
    return History(
        questions=tuple(r[0] for r in reversed(rows)),        # newest-first query, oldest-first window
        last_answer=last[0] if last and not last[1] else None,
    )


def rewrite_question(history: History, message: str) -> str:
    """The message as a complete question. Never fails: on any problem, the message as typed."""
    if not history.questions:
        return message                    # first message: nothing to resolve, no extra model call
    try:
        raw = llm.generate(*build_rewrite_prompt(history, message))
    except llm.LLMUnavailable:
        # Model unreachable or hung: the answer call would wait a full timeout and fail the same way.
        # Fail now (the API gives 502) instead of making the user wait twice.
        raise
    except llm.LLMError as exc:
        # The error type only: the log must never contain my study text.
        log.warning("Rewrite of a follow-up failed (%s); searching the message as typed",
                    type(exc).__name__)
        return message
    return clean_rewrite(raw, message)


def answer_question(
    conversation_id: uuid.UUID,
    workspace_id: uuid.UUID,
    instructions: str,
    question: str,
) -> ChatResult:
    """Answer `question` from the workspace's documents and save both messages.

    The caller must already have verified that the user owns conversation_id (and so workspace_id).
    Raises LLMError if the model fails, ConversationGone if the chat was deleted meanwhile.
    In both cases nothing is saved.
    """
    # Short block: read the window, then give the connection back BEFORE the slow model calls.
    with pool.connection() as conn:
        history = load_history(conn, conversation_id)
    standalone = rewrite_question(history, question)          # model call #1, only with history
    draft = draft_answer(workspace_id, standalone, instructions)   # model call #2 (as before)
    parsed = draft.parsed

    # [n] was numbered from 1 in the prompt, so passage n is hits[n - 1].
    # The file name and page come from OUR search result, never from the model's text.
    cited_hits = [(n, draft.hits[n - 1]) for n in parsed.cited]
    citations: list[Citation] = []

    # The slow part is over. Only now do we borrow a DB connection.
    # One transaction: question, answer and citations are saved together or not at all.
    with pool.connection() as conn:
        # The model call took seconds; the chat may have been deleted meanwhile.
        # "for update" LOCKS the row until this transaction ends: a delete arriving now waits
        # for us. A plain check would leave a gap between "check" and "insert" for it to slip into.
        if conn.execute(
            "select 1 from conversations where id = %s for update", (conversation_id,)
        ).fetchone() is None:
            raise ConversationGone(conversation_id)

        conn.execute(
            "insert into messages (conversation_id, role, content, standalone_question) "
            "values (%s, 'user', %s, %s)",
            (conversation_id, question, standalone),
        )
        message_id = conn.execute(
            "insert into messages (conversation_id, role, content, refused) "
            "values (%s, 'assistant', %s, %s) returning id",
            (conversation_id, parsed.text, parsed.refused),
        ).fetchone()[0]
        for n, h in cited_hits:
            # The user may also have deleted the cited document meanwhile.
            # A plain chunk_id would then break the foreign key and lose the whole answer.
            # "(select id from chunks where id = %s)" gives the id if the row still exists and
            # NULL if it does not: the same "source removed" state as a later deletion (ADR-003).
            # "returning" hands back what was really stored, so the reply matches the database.
            chunk_id, document_id = conn.execute(
                "insert into message_citations "
                "(message_id, n, chunk_id, document_id, filename, page, excerpt) "
                "values (%s, %s, (select id from chunks where id = %s), "
                "(select id from documents where id = %s), %s, %s, %s) "
                "returning chunk_id, document_id",
                (message_id, n, h.chunk_id, h.document_id, h.filename, h.page, h.text),
            ).fetchone()
            citations.append(Citation(n, chunk_id, document_id, h.filename, h.page, h.text))
        # The first question names the chat. "title is null" makes later questions leave it alone.
        conn.execute(
            "update conversations set title = %s where id = %s and title is null",
            (question[:60], conversation_id),
        )

    return ChatResult(message_id, parsed.text, parsed.refused, citations, standalone)
