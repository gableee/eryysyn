import os
import uuid
from contextlib import contextmanager
from types import SimpleNamespace

import psycopg
import pytest

from app.db.session import pool
from app.llm import client as llm_client
from app.services import chat as chat_service
from app.llm.client import LLMError
from app.rag.prompt import REFUSAL
from tests.test_indexing import make_pdf
from tests.test_isolation import auth, client, login

PAGES = (
    "Photosynthesis in plants converts sunlight into chemical energy stored as sugar.",
    "The stock market crashed in 1929, which began the Great Depression.",
    "Volcanoes erupt when magma rises through cracks in the Earth's crust.",
)
QUESTION = "What happened to the stock market in 1929?"


def _a():
    return login(os.environ["TEST_USER_A_EMAIL"], os.environ["TEST_USER_A_PASSWORD"])


def _b():
    return login(os.environ["TEST_USER_B_EMAIL"], os.environ["TEST_USER_B_PASSWORD"])


def _upload(token, ws):
    up = client.post(f"/workspaces/{ws}/documents", headers=auth(token),
                     files={"file": ("facts.pdf", make_pdf(*PAGES), "application/pdf")})
    assert up.json()["status"] == "indexed"
    return up.json()["id"]


@pytest.fixture(scope="module")
def env():
    """User A with one indexed document. Shared by the module to index only once."""
    token = _a()
    ws = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    doc = _upload(token, ws)
    yield token, ws
    client.delete(f"/documents/{doc}", headers=auth(token))


@pytest.fixture
def chat(env):
    token, ws = env
    conv = client.post(f"/workspaces/{ws}/conversations", headers=auth(token), json={}).json()["id"]
    yield token, ws, conv
    client.delete(f"/conversations/{conv}", headers=auth(token))


def fake(text, seen=None):
    def generate(system, user):
        if seen is not None:
            seen.update(system=system, user=user)
        return text
    return generate


def ask(token, conv, question=QUESTION):
    return client.post(f"/conversations/{conv}/messages", headers=auth(token), json={"question": question})


def test_grounded_answer_returns_only_valid_citations_from_the_database(chat, monkeypatch):
    token, _, conv = chat
    monkeypatch.setattr(llm_client, "generate", fake("It crashed in 1929 [1]. Invented [9]."))
    r = ask(token, conv)
    assert r.status_code == 201
    body = r.json()
    assert body["refused"] is False
    assert "[1]" in body["answer"] and "[9]" not in body["answer"]
    assert [c["n"] for c in body["citations"]] == [1]
    c = body["citations"][0]
    assert c["filename"] == "facts.pdf" and c["page"] == 2 and "1929" in c["excerpt"]
    assert c["chunk_id"] and c["document_id"]


def test_the_model_receives_rules_passages_and_question(chat, monkeypatch):
    token, _, conv = chat
    seen = {}
    monkeypatch.setattr(llm_client, "generate", fake("Crash [1].", seen))
    ask(token, conv)
    assert REFUSAL in seen["system"] and "<style>" not in seen["system"]
    assert '<passage n="1" file="facts.pdf" page="2">' in seen["user"]
    assert f"<question>\n{QUESTION}\n</question>" in seen["user"]


def test_chat_instructions_reach_the_model_after_the_rules(env, monkeypatch):
    token, ws = env
    conv = client.post(f"/workspaces/{ws}/conversations", headers=auth(token),
                       json={"instructions": "Talk like my friend"}).json()["id"]
    try:
        seen = {}
        monkeypatch.setattr(llm_client, "generate", fake("Crash [1].", seen))
        ask(token, conv)
        assert "<style>Talk like my friend</style>" in seen["system"]
        assert seen["system"].index(REFUSAL) < seen["system"].index("<style>")
        # PATCH changes them for the next question
        client.patch(f"/conversations/{conv}", headers=auth(token), json={"instructions": "Be formal"})
        ask(token, conv)
        assert "<style>Be formal</style>" in seen["system"]
    finally:
        client.delete(f"/conversations/{conv}", headers=auth(token))


@pytest.mark.parametrize("reply", [REFUSAL, "Paris is the capital of France.", "Something [7]."])
def test_refusal_or_no_valid_citation_gives_a_clean_refusal(chat, monkeypatch, reply):
    token, _, conv = chat
    monkeypatch.setattr(llm_client, "generate", fake(reply))
    body = ask(token, conv).json()
    assert body == {"message_id": body["message_id"], "answer": REFUSAL, "refused": True,
                    "search_question": QUESTION, "citations": []}


def test_empty_workspace_refuses_without_calling_the_model(monkeypatch):
    token = _b()                                     # user B has no documents
    ws = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    conv = client.post(f"/workspaces/{ws}/conversations", headers=auth(token), json={}).json()["id"]

    def must_not_run(system, user):
        raise AssertionError("model was called for an empty workspace")

    monkeypatch.setattr(llm_client, "generate", must_not_run)
    try:
        body = ask(token, conv).json()
        assert body["refused"] is True and body["answer"] == REFUSAL
    finally:
        client.delete(f"/conversations/{conv}", headers=auth(token))


def test_model_failure_returns_502_and_saves_nothing(chat, monkeypatch):
    token, _, conv = chat

    def broken(system, user):
        raise LLMError("ollama is not running")

    monkeypatch.setattr(llm_client, "generate", broken)
    r = ask(token, conv)
    assert r.status_code == 502
    saved = client.get(f"/conversations/{conv}", headers=auth(token)).json()
    assert saved["messages"] == [] and saved["title"] is None


def test_chat_is_saved_question_first_with_title_and_citations(chat, monkeypatch):
    token, ws, conv = chat
    monkeypatch.setattr(llm_client, "generate", fake("It crashed [1]."))
    long_question = QUESTION + " " + "x" * 80
    ask(token, conv, long_question)
    ask(token, conv, "Second question?")
    saved = client.get(f"/conversations/{conv}", headers=auth(token)).json()
    assert saved["title"] == long_question[:60]                  # set once, by the first question
    assert [m["role"] for m in saved["messages"]] == ["user", "assistant", "user", "assistant"]
    assert saved["messages"][0]["content"] == long_question
    assert saved["messages"][1]["citations"][0]["page"] == 2
    assert saved["messages"][0]["citations"] == []
    listed = client.get(f"/workspaces/{ws}/conversations", headers=auth(token)).json()
    assert conv in [c["id"] for c in listed]


def test_citation_survives_deleting_the_document(monkeypatch):
    token = _b()     # B's workspace is otherwise empty, so the cited chunk is certainly from this upload
    ws = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    doc = _upload(token, ws)
    conv = client.post(f"/workspaces/{ws}/conversations", headers=auth(token), json={}).json()["id"]
    try:
        monkeypatch.setattr(llm_client, "generate", fake("It crashed [1]."))
        ask(token, conv)
        client.delete(f"/documents/{doc}", headers=auth(token))
        cited = client.get(f"/conversations/{conv}", headers=auth(token)).json()["messages"][1]["citations"][0]
        assert cited["filename"] == "facts.pdf" and cited["page"] == 2      # ADR-003: the copy stays
        assert cited["chunk_id"] is None and cited["document_id"] is None   # source removed
    finally:
        client.delete(f"/conversations/{conv}", headers=auth(token))
        client.delete(f"/documents/{doc}", headers=auth(token))


def test_document_deleted_while_the_model_is_writing_still_saves_the_answer(monkeypatch):
    """The model call takes seconds. If the user deletes the document meanwhile, the answer
    must still be saved, with the citation marked 'source removed' (not a database error)."""
    token = _b()
    ws = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    doc = _upload(token, ws)
    conv = client.post(f"/workspaces/{ws}/conversations", headers=auth(token), json={}).json()["id"]

    def slow_model(system, user):
        client.delete(f"/documents/{doc}", headers=auth(token))   # happens "during" the model call
        return "It crashed [1]."

    monkeypatch.setattr(llm_client, "generate", slow_model)
    try:
        r = ask(token, conv)
        assert r.status_code == 201
        cited = r.json()["citations"][0]
        assert cited["filename"] == "facts.pdf" and cited["page"] == 2
        assert cited["chunk_id"] is None and cited["document_id"] is None
    finally:
        client.delete(f"/conversations/{conv}", headers=auth(token))
        client.delete(f"/documents/{doc}", headers=auth(token))


def test_chat_deleted_while_the_model_is_writing_gives_404_and_saves_nothing(env, monkeypatch):
    """Review #1: the same race as the document one, but on the chat itself."""
    token, ws = env
    conv = client.post(f"/workspaces/{ws}/conversations", headers=auth(token), json={}).json()["id"]

    def model_while_chat_is_deleted(system, user):
        assert client.delete(f"/conversations/{conv}", headers=auth(token)).status_code == 204
        return "It crashed [1]."

    monkeypatch.setattr(llm_client, "generate", model_while_chat_is_deleted)
    r = ask(token, conv)
    assert r.status_code == 404
    assert client.get(f"/conversations/{conv}", headers=auth(token)).status_code == 404


def _delete_is_blocked(conversation_id) -> bool:
    """From a SECOND connection: try to delete the chat, waiting at most 1 s for its row lock.
    Always rolled back, so the chat is never really deleted here."""
    with pool.connection() as other:
        other.execute("set lock_timeout = '1s'")
        try:
            other.execute("delete from conversations where id = %s", (conversation_id,))
            blocked = False
        except psycopg.errors.LockNotAvailable:
            blocked = True
        other.rollback()
    return blocked


def test_chat_row_is_locked_while_the_answer_is_saved(chat, monkeypatch):
    """Review #1, the lock itself. The test above deletes the chat BEFORE the save starts, so it
    passes even without `for update` (mutation check, 2026-11-17). This one tries the delete
    INSIDE the save, right after the lock is taken: it must wait instead of slipping in."""
    token, _, conv = chat
    monkeypatch.setattr(llm_client, "generate", fake("It crashed [1]."))
    blocked = []

    class SpyConnection:
        """Wraps the save's connection: after the locking select runs, try a delete elsewhere."""
        def __init__(self, conn):
            self.conn = conn

        def execute(self, query, params=None):
            cursor = self.conn.execute(query, params)
            if query.startswith("select 1 from conversations"):   # the save's existence check
                blocked.append(_delete_is_blocked(conv))
            return cursor

    @contextmanager
    def spy_connection():
        with pool.connection() as conn:
            yield SpyConnection(conn)

    # Replace only chat.py's name `pool`; the endpoint and _delete_is_blocked keep the real one.
    monkeypatch.setattr(chat_service, "pool", SimpleNamespace(connection=spy_connection))
    r = ask(token, conv)
    assert blocked == [True]          # the delete had to wait for our lock (and gave up after 1 s)
    assert r.status_code == 201       # and the answer was saved normally


def test_nul_character_is_rejected_before_any_work(chat, monkeypatch):
    """Review #3: Postgres text cannot hold \\x00. Reject it as 422, before the model runs."""
    token, ws, conv = chat
    h = auth(token)

    def must_not_run(system, user):
        raise AssertionError("model was called for an invalid question")

    monkeypatch.setattr(llm_client, "generate", must_not_run)
    assert client.post(f"/conversations/{conv}/messages", headers=h, json={"question": "what\u0000 is x"}).status_code == 422
    assert client.post(f"/workspaces/{ws}/conversations", headers=h, json={"instructions": "a\u0000b"}).status_code == 422
    assert client.patch(f"/conversations/{conv}", headers=h, json={"instructions": "a\u0000b"}).status_code == 422
    assert client.patch(f"/conversations/{conv}", headers=h, json={"title": "a\u0000b"}).status_code == 422


def test_user_b_cannot_reach_user_a_chat(chat):
    token_a, ws_a, conv = chat
    b = auth(_b())
    assert client.get(f"/conversations/{conv}", headers=b).status_code == 404
    assert client.patch(f"/conversations/{conv}", headers=b, json={"title": "x"}).status_code == 404
    assert client.post(f"/conversations/{conv}/messages", headers=b, json={"question": "x"}).status_code == 404
    assert client.delete(f"/conversations/{conv}", headers=b).status_code == 404
    assert client.get(f"/workspaces/{ws_a}/conversations", headers=b).status_code == 404
    assert client.post(f"/workspaces/{ws_a}/conversations", headers=b, json={}).status_code == 404
    assert client.get(f"/conversations/{conv}").status_code in (401, 403)          # no token
    assert client.get(f"/conversations/{conv}", headers=auth(token_a)).status_code == 200   # still there


def test_input_is_validated(chat):
    token, ws, conv = chat
    h = auth(token)
    assert client.post(f"/conversations/{conv}/messages", headers=h, json={"question": ""}).status_code == 422
    assert client.post(f"/conversations/{conv}/messages", headers=h, json={"question": "x" * 1001}).status_code == 422
    assert client.post(f"/workspaces/{ws}/conversations", headers=h, json={"instructions": "x" * 501}).status_code == 422
    assert client.patch(f"/conversations/{conv}", headers=h, json={"instructions": "x" * 501}).status_code == 422
    assert client.patch(f"/conversations/{conv}", headers=h, json={"title": ""}).status_code == 422


def test_draft_answer_searches_k_passages(env, monkeypatch):
    """The eval varies k (how many passages the model sees); the API keeps the default 5."""
    from app.services.chat import draft_answer
    _, ws = env
    monkeypatch.setattr(llm_client, "generate", fake("Crash [1]."))
    workspace = uuid.UUID(ws)
    assert len(draft_answer(workspace, QUESTION, k=1).hits) == 1
    assert len(draft_answer(workspace, QUESTION).hits) == 3      # default 5, the PDF has 3 chunks


# --- Follow-up questions: history -> rewrite -> complete question (Task 3) -------------------------

from app.rag.rewrite import REWRITE_RULES  # noqa: E402

FOLLOW_UP = "why did it happen?"
REWRITTEN = "Why did the stock market crash in 1929?"


def fake_chat(rewrite_reply, answer_reply, calls):
    """Rewrite calls (system == REWRITE_RULES) get rewrite_reply; answer calls get answer_reply.
    A reply that is an Exception is raised instead, to simulate the model failing."""
    def generate(system, user):
        kind = "rewrite" if system == REWRITE_RULES else "answer"
        calls.append((kind, user))
        reply = rewrite_reply if kind == "rewrite" else answer_reply
        if isinstance(reply, Exception):
            raise reply
        return reply
    return generate


def _rows(conv, sql, *args):
    with pool.connection() as conn:
        return conn.execute(sql, (conv, *args)).fetchall()


def _insert_turn(conn, conv, question, standalone, answer="Answer [1].", refused=False):
    conn.execute("insert into messages (conversation_id, role, content, standalone_question) "
                 "values (%s, 'user', %s, %s)", (conv, question, standalone))
    conn.execute("insert into messages (conversation_id, role, content, refused) "
                 "values (%s, 'assistant', %s, %s)", (conv, answer, refused))


def test_first_message_makes_one_model_call_and_searches_the_typed_text(chat, monkeypatch):
    token, _, conv = chat
    calls = []
    monkeypatch.setattr(llm_client, "generate", fake_chat("unused", "It crashed [1].", calls))
    r = ask(token, conv)
    assert [kind for kind, _ in calls] == ["answer"]            # no history -> no rewrite call
    assert r.json()["search_question"] == QUESTION


def test_follow_up_is_rewritten_and_the_complete_question_is_searched_and_answered(chat, monkeypatch):
    token, _, conv = chat
    calls = []
    monkeypatch.setattr(llm_client, "generate", fake_chat(REWRITTEN, "It crashed [1].", calls))
    ask(token, conv)
    calls.clear()
    r = ask(token, conv, FOLLOW_UP)
    assert [kind for kind, _ in calls] == ["rewrite", "answer"]
    assert QUESTION in calls[0][1]                               # the rewriter saw turn 1
    assert REWRITTEN in calls[1][1]                              # the answer model got the complete question
    assert r.json()["search_question"] == REWRITTEN


def test_the_complete_question_is_saved_on_the_user_message(chat, monkeypatch):
    token, _, conv = chat
    monkeypatch.setattr(llm_client, "generate", fake_chat(REWRITTEN, "It crashed [1].", []))
    ask(token, conv)
    ask(token, conv, FOLLOW_UP)
    rows = _rows(conv, "select standalone_question from messages "
                       "where conversation_id = %s and role = 'user' order by seq")
    assert [r[0] for r in rows] == [QUESTION, REWRITTEN]


def test_rewriter_failure_falls_back_to_the_typed_message(chat, monkeypatch):
    token, _, conv = chat
    monkeypatch.setattr(llm_client, "generate", fake_chat(LLMError("down"), "It crashed [1].", []))
    ask(token, conv)
    r = ask(token, conv, FOLLOW_UP)
    assert r.status_code == 201
    assert r.json()["search_question"] == FOLLOW_UP
    assert r.json()["refused"] is False                          # the answer was still made and saved


def test_rewriter_failure_is_logged_without_the_users_text(chat, monkeypatch, caplog):
    token, _, conv = chat
    monkeypatch.setattr(llm_client, "generate", fake_chat(LLMError("down"), "It crashed [1].", []))
    ask(token, conv)
    with caplog.at_level("WARNING"):
        ask(token, conv, FOLLOW_UP)
    assert "rewrite" in caplog.text.lower()                      # the failure IS logged ...
    assert FOLLOW_UP not in caplog.text and QUESTION not in caplog.text   # ... without my study text


def test_another_users_chat_gives_404_without_reading_history_or_rewriting(chat, monkeypatch):
    token, _, conv = chat
    calls = []
    monkeypatch.setattr(llm_client, "generate", fake_chat(REWRITTEN, "It crashed [1].", calls))
    ask(token, conv)
    calls.clear()
    r = client.post(f"/conversations/{conv}/messages", headers=auth(_b()), json={"question": FOLLOW_UP})
    assert r.status_code == 404
    assert calls == []


def test_history_reads_only_the_last_six_questions_oldest_first(chat):
    _, _, conv = chat
    with pool.connection() as conn:
        for i in range(1, 9):
            _insert_turn(conn, conv, f"q{i}", f"Q{i}?")
        history = chat_service.load_history(conn, uuid.UUID(conv))
    assert history.questions == ("Q3?", "Q4?", "Q5?", "Q6?", "Q7?", "Q8?")
    assert history.last_answer == "Answer [1]."


def test_old_rows_without_a_standalone_question_use_the_typed_text(chat):
    _, _, conv = chat
    with pool.connection() as conn:
        _insert_turn(conn, conv, "old typed?", None)
        history = chat_service.load_history(conn, uuid.UUID(conv))
    assert history.questions == ("old typed?",)


def test_a_refused_last_answer_is_not_given_to_the_rewriter(chat):
    _, _, conv = chat
    with pool.connection() as conn:
        _insert_turn(conn, conv, "q?", "Q?", answer=REFUSAL, refused=True)
        history = chat_service.load_history(conn, uuid.UUID(conv))
    assert history.last_answer is None


def test_draft_answer_can_search_a_different_text_than_it_asks(env, monkeypatch):
    """The eval's concat mode: search with glued turns, but ask the model the typed message."""
    _, ws = env
    searched, seen = [], {}
    real_search = chat_service.search_chunks
    monkeypatch.setattr(chat_service, "search_chunks",
                        lambda w, q, k: searched.append(q) or real_search(w, q, k))
    monkeypatch.setattr(llm_client, "generate", fake("Crash [1].", seen))
    chat_service.draft_answer(uuid.UUID(ws), "why", search_query="glued text")
    assert searched == ["glued text"]
    assert "<question>\nwhy\n</question>" in seen["user"]
