import os

from tests.test_indexing import make_pdf
from tests.test_isolation import auth, client, login

PAGES = (
    "Photosynthesis in plants converts sunlight into chemical energy stored as sugar.",
    "The stock market crashed in 1929, which began the Great Depression.",
    "Volcanoes erupt when magma rises through cracks in the Earth's crust.",
)


def _login_a():
    return login(os.environ["TEST_USER_A_EMAIL"], os.environ["TEST_USER_A_PASSWORD"])


def _login_b():
    return login(os.environ["TEST_USER_B_EMAIL"], os.environ["TEST_USER_B_PASSWORD"])


def test_search_returns_the_right_page_first_with_filename():
    token = _login_a()
    ws = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    up = client.post(
        f"/workspaces/{ws}/documents",
        headers=auth(token),
        files={"file": ("facts.pdf", make_pdf(*PAGES), "application/pdf")},
    )
    doc = up.json()["id"]
    try:
        assert up.json()["status"] == "indexed"
        r = client.post(
            f"/workspaces/{ws}/search",
            headers=auth(token),
            json={"question": "What happened to the stock market in 1929?", "k": 3},
        )
        assert r.status_code == 200
        hits = r.json()
        assert len(hits) == 3                                  # k respected
        assert hits[0]["page"] == 2                            # the right page ranks first
        assert hits[0]["filename"] == "facts.pdf"
        scores = [h["score"] for h in hits]
        assert scores == sorted(scores, reverse=True)          # best first
    finally:
        client.delete(f"/documents/{doc}", headers=auth(token))


def test_user_b_cannot_search_user_a_workspace_or_see_their_chunks():
    ta, tb = _login_a(), _login_b()
    ws_a = client.get("/workspaces", headers=auth(ta)).json()[0]["id"]
    ws_b = client.get("/workspaces", headers=auth(tb)).json()[0]["id"]
    up = client.post(
        f"/workspaces/{ws_a}/documents",
        headers=auth(ta),
        files={"file": ("facts.pdf", make_pdf(*PAGES), "application/pdf")},
    )
    doc = up.json()["id"]
    question = {"question": "What happened to the stock market in 1929?"}
    try:
        # B asks A's workspace: 404, as if it does not exist
        assert client.post(f"/workspaces/{ws_a}/search", headers=auth(tb), json=question).status_code == 404
        # B asks B's own workspace: A's chunks must not leak in
        r = client.post(f"/workspaces/{ws_b}/search", headers=auth(tb), json=question)
        assert r.status_code == 200 and r.json() == []
        # no token at all
        assert client.post(f"/workspaces/{ws_a}/search", json=question).status_code in (401, 403)
    finally:
        client.delete(f"/documents/{doc}", headers=auth(ta))


def test_search_validates_input():
    token = _login_a()
    ws = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    url = f"/workspaces/{ws}/search"
    assert client.post(url, headers=auth(token), json={"question": ""}).status_code == 422
    assert client.post(url, headers=auth(token), json={"question": "x", "k": 0}).status_code == 422
    assert client.post(url, headers=auth(token), json={"question": "x", "k": 99}).status_code == 422
