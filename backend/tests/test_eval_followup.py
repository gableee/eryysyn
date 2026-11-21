"""The eval plays a multi-turn case turn by turn. These tests swap the model and search for recorders,
so they check only HOW each mode feeds the pipeline, not answer quality (that is the eval's job)."""

import uuid

import pytest

from app.evals import followup
from app.evals.golden import Question
from app.rag.citations import ParsedAnswer
from app.services.chat import Draft

WS = uuid.uuid4()


def _q(turns=("t1", "t2"), q="q"):
    return Question(id="f", set="ethics", q=q, expect="answer", file="ethics.pdf", pages=(8,), turns=turns)


@pytest.fixture
def calls(monkeypatch):
    """Record every draft_answer and rewrite_question call. Every answer is 'A [1].'"""
    seen = {"draft": [], "rewrite": []}

    def draft(workspace_id, question, instructions="", k=5, search_query=None):
        seen["draft"].append({"question": question, "search_query": search_query})
        return Draft([], None, None, "A [1].", ParsedAnswer("A [1].", [1], False))

    def rewrite(history, message):
        seen["rewrite"].append(history)
        return "REWRITTEN " + message

    monkeypatch.setattr(followup, "draft_answer", draft)
    monkeypatch.setattr(followup, "rewrite_question", rewrite)
    return seen


def test_none_mode_searches_and_asks_each_turn_as_typed(calls):
    _, turns = followup.play(WS, _q(), "none", k=5)
    assert [c["question"] for c in calls["draft"]] == ["t1", "t2", "q"]
    assert all(c["search_query"] is None for c in calls["draft"])
    assert calls["rewrite"] == []
    assert [t["searched"] for t in turns] == ["t1", "t2", "q"]
    assert all(t["seconds"] >= 0 for t in turns)                # per-turn time, to measure the rewrite cost


def test_concat_mode_glues_earlier_turns_into_the_search_only(calls):
    _, turns = followup.play(WS, _q(), "concat", k=5)
    assert calls["draft"][-1] == {"question": "q", "search_query": "t1 t2 q"}
    assert calls["rewrite"] == []
    assert turns[-1]["searched"] == "t1 t2 q"


def test_rewrite_mode_hands_each_complete_question_to_the_next_turn(calls):
    _, turns = followup.play(WS, _q(), "rewrite", k=5)
    second = calls["rewrite"][1]
    assert second.questions == ("REWRITTEN t1",)            # the saved COMPLETE question, not "t1"
    assert second.last_answer is None                         # the rewriter is blind to answers (f11)
    assert calls["draft"][1] == {"question": "REWRITTEN t2", "search_query": None}
    assert [t["typed"] for t in turns] == ["t1", "t2", "q"]
    assert [t["searched"] for t in turns] == ["REWRITTEN t1", "REWRITTEN t2", "REWRITTEN q"]


@pytest.mark.parametrize("mode", followup.MODES)
def test_a_question_without_turns_is_one_plain_call_in_every_mode(calls, mode):
    draft, turns = followup.play(WS, _q(turns=()), mode, k=5)
    assert len(calls["draft"]) == 1 and calls["draft"][0]["question"] in ("q", "REWRITTEN q")
    assert len(turns) == 1 and draft.parsed.text == "A [1]."
