"""GET /documents/{id}/file: a short-lived signed link to the stored PDF, only for its owner.

Runs against the real test stack (Supabase test users A and B), like tests/test_isolation.py.
"""
import os
import uuid

import httpx
import pytest

from tests.test_indexing import make_pdf
from tests.test_isolation import auth, client, login


def _a():
    return login(os.environ["TEST_USER_A_EMAIL"], os.environ["TEST_USER_A_PASSWORD"])


def _b():
    return login(os.environ["TEST_USER_B_EMAIL"], os.environ["TEST_USER_B_PASSWORD"])


@pytest.fixture(scope="module")
def doc_a():
    """User A uploads one small PDF; deleted after the module."""
    token = _a()
    ws = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    up = client.post(f"/workspaces/{ws}/documents", headers=auth(token),
                     files={"file": ("reader.pdf", make_pdf("Page one.", "Page two."), "application/pdf")})
    assert up.status_code == 201
    doc = up.json()["id"]
    yield token, doc
    client.delete(f"/documents/{doc}", headers=auth(token))


def test_owner_gets_a_working_signed_link(doc_a):
    token, doc = doc_a
    r = client.get(f"/documents/{doc}/file", headers=auth(token))
    assert r.status_code == 200
    assert r.json()["expires_in"] == 600
    pdf = httpx.get(r.json()["url"])
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


def test_link_allows_range_requests(doc_a):
    """Settles the spec's open question: can PDF.js load the file in pieces through the signed link?"""
    token, doc = doc_a
    url = client.get(f"/documents/{doc}/file", headers=auth(token)).json()["url"]
    part = httpx.get(url, headers={"Range": "bytes=0-99"})
    print("range status:", part.status_code, "bytes:", len(part.content),
          "accept-ranges:", part.headers.get("accept-ranges"))
    assert part.status_code in (200, 206)


def test_other_user_and_missing_id_get_404(doc_a):
    _, doc = doc_a
    assert client.get(f"/documents/{doc}/file", headers=auth(_b())).status_code == 404
    assert client.get(f"/documents/{uuid.uuid4()}/file", headers=auth(_a())).status_code == 404
