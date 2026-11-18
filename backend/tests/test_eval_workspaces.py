"""Eval workspaces: created per run, ALWAYS deleted afterwards (real database).

Only the small trap sets (d2, d3) are used here, so each test indexes in seconds.
"""

import os

import pytest

from app.db.session import pool
from app.evals.sets import SETS, DocSpec
from app.evals.workspaces import eval_owner_id, eval_workspaces, pdf_bytes
from tests.test_isolation import auth, client, login


def eval_workspace_names(owner) -> list[str]:
    with pool.connection() as conn:
        rows = conn.execute(
            "select name from workspaces where owner_id = %s and name like 'eval:%%' order by name",
            (owner,),
        ).fetchall()
    return [r[0] for r in rows]


@pytest.fixture(scope="module")
def owner():
    return eval_owner_id()


def test_trap_sets_are_defined():
    assert {"ethics", "d1", "d2", "d3"} <= SETS.keys()
    assert len(SETS["d2"][0].pages) == 2


def test_negation_set_pairs_each_fact_with_its_negated_twin():
    pages = SETS["neg"][0].pages
    assert len(pages) == 6
    for positive, negative in zip(pages[0::2], pages[1::2]):   # pages 1+2, 3+4, 5+6
        assert " not " in negative and " not " not in positive


def test_set_is_indexed_and_deleted_afterwards(owner):
    with eval_workspaces(owner, ["d2"]) as ws:
        assert eval_workspace_names(owner) == ["eval:d2"]
        with pool.connection() as conn:
            pages = {r[0] for r in conn.execute(
                "select distinct page from chunks where workspace_id = %s", (ws["d2"],)).fetchall()}
        assert pages == {1, 2}
    assert eval_workspace_names(owner) == []


def test_workspaces_deleted_when_block_raises(owner):
    with pytest.raises(RuntimeError):
        with eval_workspaces(owner, ["d3"]):
            raise RuntimeError("the run crashed half-way")
    assert eval_workspace_names(owner) == []


def test_leftover_eval_workspaces_removed_on_start(owner):
    # A run killed hard (kill -9, power cut) never reaches its cleanup.
    with pool.connection() as conn:
        conn.execute("insert into workspaces (owner_id, name) values (%s, 'eval:old')", (owner,))
    with eval_workspaces(owner, ["d2"]):
        assert "eval:old" not in eval_workspace_names(owner)
    assert eval_workspace_names(owner) == []


def test_personal_workspace_still_first_for_tests(owner):
    token = login(os.environ["TEST_USER_A_EMAIL"], os.environ["TEST_USER_A_PASSWORD"])
    before = client.get("/workspaces", headers=auth(token)).json()[0]["id"]
    with eval_workspaces(owner, ["d2"]):
        pass
    assert client.get("/workspaces", headers=auth(token)).json()[0]["id"] == before


def test_missing_document_file_names_the_path(tmp_path):
    with pytest.raises(FileNotFoundError, match="x.pdf") as e:
        pdf_bytes(DocSpec("x.pdf", path=tmp_path / "x.pdf"))
    assert "scratch/" in str(e.value)
