import os

import pymupdf

from app.db.session import pool
from tests.test_isolation import auth, client, login


def make_pdf(*page_texts: str) -> bytes:
    doc = pymupdf.open()
    for text in page_texts:
        doc.new_page().insert_textbox(pymupdf.Rect(72, 72, 520, 700), text, fontsize=11)
    return doc.tobytes()


def chunk_rows(doc_id):
    with pool.connection() as conn:
        return conn.execute(
            "select page, chunk_index, embedding_model, vector_dims(embedding) "
            "from chunks where document_id = %s order by chunk_index",
            (doc_id,),
        ).fetchall()


def test_upload_indexes_chunks_and_delete_removes_them():
    token = login(os.environ["TEST_USER_A_EMAIL"], os.environ["TEST_USER_A_PASSWORD"])
    ws = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    pdf = make_pdf(
        "Informed consent means users are told the risks of the software.",
        "Employers expect loyalty, and conflicts of interest must be disclosed.",
    )
    up = client.post(
        f"/workspaces/{ws}/documents",
        headers=auth(token),
        files={"file": ("t.pdf", pdf, "application/pdf")},
    )
    assert up.status_code == 201
    doc = up.json()["id"]
    try:
        assert up.json()["status"] == "indexed"
        rows = chunk_rows(doc)
        assert [r[0] for r in rows] == [1, 2]            # one chunk per page, never across pages
        assert [r[1] for r in rows] == [0, 1]
        assert all(r[2] == "BAAI/bge-small-en-v1.5" and r[3] == 384 for r in rows)

        # re-index replaces chunks instead of duplicating them
        r = client.post(f"/documents/{doc}/index", headers=auth(token))
        assert r.status_code == 200 and r.json()["status"] == "indexed"
        assert len(chunk_rows(doc)) == 2
    finally:
        assert client.delete(f"/documents/{doc}", headers=auth(token)).status_code == 204
    assert chunk_rows(doc) == []                          # ADR-002: cascade removed the chunks


def test_unreadable_pdf_is_marked_failed_with_no_chunks():
    token = login(os.environ["TEST_USER_A_EMAIL"], os.environ["TEST_USER_A_PASSWORD"])
    ws = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    up = client.post(
        f"/workspaces/{ws}/documents",
        headers=auth(token),
        files={"file": ("bad.pdf", b"%PDF-1.4\n%broken\n", "application/pdf")},
    )
    assert up.status_code == 201                          # file is kept so it can be retried
    doc = up.json()["id"]
    try:
        assert up.json()["status"] == "failed"
        assert chunk_rows(doc) == []                      # all or nothing
    finally:
        client.delete(f"/documents/{doc}", headers=auth(token))


def test_user_b_cannot_reindex_user_a_document():
    ta = login(os.environ["TEST_USER_A_EMAIL"], os.environ["TEST_USER_A_PASSWORD"])
    tb = login(os.environ["TEST_USER_B_EMAIL"], os.environ["TEST_USER_B_PASSWORD"])
    ws = client.get("/workspaces", headers=auth(ta)).json()[0]["id"]
    up = client.post(
        f"/workspaces/{ws}/documents",
        headers=auth(ta),
        files={"file": ("t.pdf", make_pdf("Some text to index."), "application/pdf")},
    )
    doc = up.json()["id"]
    try:
        assert client.post(f"/documents/{doc}/index", headers=auth(tb)).status_code == 404
    finally:
        client.delete(f"/documents/{doc}", headers=auth(ta))
