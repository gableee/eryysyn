"""Play a multi-turn golden case through the real pipeline, turn by turn, without saving a chat.

The earlier turns (q.turns) are played live, so the last turn sees the same history a real chat would:
earlier complete questions (and the newest answer only while rewrite.INCLUDE_ANSWER is on; it is off
since eval f11). Only the last turn (q.q) is scored.

Modes, to measure what the rewriter adds:
  none     each message searched and asked as typed (the chat before follow-up support)
  concat   search text = all typed messages so far glued together; the model is asked the last one
  rewrite  the real chat behaviour: rewrite_question, then search and ask the complete question
"""

import time
import uuid

from app.evals.golden import Question
from app.rag import rewrite
from app.rag.rewrite import HISTORY_TURNS, History
from app.services.chat import Draft, draft_answer, rewrite_question

MODES = ("none", "concat", "rewrite")


def play(workspace_id: uuid.UUID, q: Question, mode: str, k: int) -> tuple[Draft, list[dict]]:
    """Return the last turn's Draft and one {"typed", "searched", "answer", "seconds"} per turn."""
    if mode not in MODES:
        raise ValueError(f"unknown follow-up mode {mode!r} (known: {', '.join(MODES)})")
    saved: list[str] = []            # complete questions so far, as the chat saves them
    last_answer: str | None = None   # as load_history: the newest answer, None after a refusal
    turns: list[dict] = []
    draft = None
    for typed in (*q.turns, q.q):
        start = time.perf_counter()
        if mode == "rewrite":
            searched = asked = rewrite_question(History(tuple(saved[-HISTORY_TURNS:]), last_answer), typed)
            draft = draft_answer(workspace_id, asked, q.instructions, k=k)
        elif mode == "concat":
            searched, asked = " ".join([*[t["typed"] for t in turns], typed]), typed
            draft = draft_answer(workspace_id, asked, q.instructions, k=k, search_query=searched)
        else:
            searched = asked = typed
            draft = draft_answer(workspace_id, asked, q.instructions, k=k)
        saved.append(searched if mode == "rewrite" else typed)
        # As load_history: the answer is kept only while the rewriter may see answers.
        last_answer = draft.parsed.text if rewrite.INCLUDE_ANSWER and not draft.parsed.refused else None
        turns.append({"typed": typed, "searched": searched, "answer": draft.parsed.text,
                      "seconds": round(time.perf_counter() - start, 2)})
    return draft, turns
