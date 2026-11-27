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


def _token_claims(url: str) -> dict:
    """The signed link carries a JWT in ?token=; its payload says when it was made and when it expires."""
    import base64
    import json
    from urllib.parse import parse_qs, urlparse
    payload = parse_qs(urlparse(url).query)["token"][0].split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def test_link_really_expires_after_ten_minutes(doc_a):
    """Final review: the old test only checked the number we report, not what Storage was asked for."""
    token, doc = doc_a
    claims = _token_claims(client.get(f"/documents/{doc}/file", headers=auth(token)).json()["url"])
    assert claims["exp"] - claims["iat"] == 600


def test_link_response_is_never_cached(doc_a):
    token, doc = doc_a
    r = client.get(f"/documents/{doc}/file", headers=auth(token))
    assert r.headers["cache-control"] == "no-store"


class _BrokenStorage:
    def __init__(self, signed=None, error=None):
        self.signed, self.error = signed, error

    def from_(self, _bucket):
        return self

    def create_signed_url(self, _path, _seconds):
        if self.error:
            raise self.error
        return self.signed


@pytest.mark.parametrize("storage", [_BrokenStorage(error=RuntimeError("storage down")), _BrokenStorage(signed={})],
                         ids=["storage raises", "no url in the reply"])
def test_storage_failure_is_a_clear_502_never_a_null_link(doc_a, monkeypatch, storage):
    """Final review: a Storage error was a bare 500, and a reply without a link returned {"url": null}."""
    import app.api.documents as documents
    token, doc = doc_a
    monkeypatch.setattr(documents, "supabase", type("FakeClient", (), {"storage": storage})())
    r = client.get(f"/documents/{doc}/file", headers=auth(token))
    assert r.status_code == 502
    assert r.json() == {"detail": "The file is not available right now. Try again."}
