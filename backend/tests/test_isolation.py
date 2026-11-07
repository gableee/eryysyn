import os
import httpx
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

load_dotenv()
client = TestClient(app)

FAKE_PDF = ("t.pdf", b"%PDF-1.4\n%test\n", "application/pdf")


def login(email: str, password: str) -> str:
    r = httpx.post(
        f"{settings.supabase_url}/auth/v1/token?grant_type=password",
        headers={"apikey": os.environ["SUPABASE_PUBLISHABLE_KEY"]},
        json={"email": email, "password": password},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_user_b_cannot_touch_user_a_documents():
    token_a = login(os.environ["TEST_USER_A_EMAIL"], os.environ["TEST_USER_A_PASSWORD"])
    token_b = login(os.environ["TEST_USER_B_EMAIL"], os.environ["TEST_USER_B_PASSWORD"])

    # A: get workspace, upload a document
    ws_a = client.get("/workspaces", headers=auth(token_a)).json()[0]["id"]
    up = client.post(
        f"/workspaces/{ws_a}/documents",
        headers=auth(token_a),
        files={"file": FAKE_PDF},
    )

    print("ws_a:", ws_a)
    print(up.status_code, up.json())
    assert up.status_code == 201
    doc_a = up.json()["id"]

    try:
        # B attacks with A's ids
        r = client.delete(f"/documents/{doc_a}", headers=auth(token_b))
        assert r.status_code == 404

        r = client.get(f"/workspaces/{ws_a}/documents", headers=auth(token_b))
        assert r.status_code == 200 and r.json() == []

        r = client.post(
            f"/workspaces/{ws_a}/documents",
            headers=auth(token_b),
            files={"file": FAKE_PDF},
        )
        assert r.status_code == 404

        # no token at all
        r = client.get(f"/workspaces/{ws_a}/documents")
        assert r.status_code in (401, 403)
    finally:
        # A cleans up, and this proves the owner CAN delete
        r = client.delete(f"/documents/{doc_a}", headers=auth(token_a))
        assert r.status_code == 204