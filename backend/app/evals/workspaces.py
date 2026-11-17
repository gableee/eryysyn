"""Temporary workspaces for an eval run: created at the start, ALWAYS deleted at the end.

Why temporary: the tests take the user's workspaces[0], and eval sets must not mix with each
other or with real documents. Deleting a workspace cascades to its documents and chunks.
"""

import os
import uuid
from collections.abc import Iterator
from contextlib import contextmanager

import pymupdf

from app.db.session import pool
from app.evals.sets import SETS, DocSpec
from app.services.indexing import index_document

PREFIX = "eval:"


def eval_owner_id() -> uuid.UUID:
    """The eval workspaces belong to test user A (never to a real user)."""
    email = os.environ.get("TEST_USER_A_EMAIL")
    if not email:
        raise RuntimeError("TEST_USER_A_EMAIL is not set (load backend/.env first)")
    with pool.connection() as conn:
        row = conn.execute("select id from auth.users where email = %s", (email,)).fetchone()
    if not row:
        raise RuntimeError(f"no Supabase user with email {email}")
    return row[0]


def pdf_bytes(doc: DocSpec) -> bytes:
    if doc.path is not None:
        if not doc.path.exists():
            raise FileNotFoundError(
                f"{doc.path} is missing. It is gitignored: copy it from scratch/ (see sets.py)")
        return doc.path.read_bytes()
    pdf = pymupdf.open()                               # same as tests/test_indexing.make_pdf
    for text in doc.pages:
        pdf.new_page().insert_textbox(pymupdf.Rect(72, 72, 520, 700), text, fontsize=11)
    return pdf.tobytes()


def _delete_eval_workspaces(owner_id: uuid.UUID) -> None:
    with pool.connection() as conn:   # cascade: documents, chunks (and any chats) go with them
        conn.execute("delete from workspaces where owner_id = %s and name like %s",
                     (owner_id, PREFIX + "%"))


@contextmanager
def eval_workspaces(owner_id: uuid.UUID, set_names: list[str]) -> Iterator[dict[str, uuid.UUID]]:
    """Yield {set name: workspace id}, each set indexed into its own fresh workspace."""
    _delete_eval_workspaces(owner_id)          # leftovers from a run that was killed hard
    try:
        workspaces: dict[str, uuid.UUID] = {}
        for name in set_names:
            with pool.connection() as conn:
                workspaces[name] = conn.execute(
                    "insert into workspaces (owner_id, name) values (%s, %s) returning id",
                    (owner_id, PREFIX + name),
                ).fetchone()[0]
            for doc in SETS[name]:
                data = pdf_bytes(doc)
                doc_id = uuid.uuid4()
                with pool.connection() as conn:
                    conn.execute(
                        "insert into documents (id, workspace_id, filename, storage_path) "
                        "values (%s, %s, %s, %s)",
                        (doc_id, workspaces[name], doc.filename, f"eval://{doc.filename}"),
                    )
                index_document(doc_id, workspaces[name], data)
        yield workspaces
    finally:
        _delete_eval_workspaces(owner_id)      # runs on success, on errors, and on Ctrl+C
