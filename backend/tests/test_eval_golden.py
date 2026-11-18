import json

import pytest

from app.evals.golden import GoldenError, Question, load_golden

SETS = {"ethics": {"ethics.pdf"}, "d2": {"d2.pdf"}}   # set -> its file names
ANSWER = {"id": "e01", "set": "ethics", "q": "Why tell customers about risks?", "expect": "answer",
          "file": "ethics.pdf", "pages": [10, 11], "must_contain": [["consent", "informed"], ["risk"]]}
REFUSE = {"id": "n01", "set": "ethics", "q": "How do I bake a cake?", "expect": "refuse"}


def write(tmp_path, *lines):
    path = tmp_path / "golden.jsonl"
    path.write_text("\n".join(x if isinstance(x, str) else json.dumps(x) for x in lines))
    return path


def test_loads_answer_and_refuse_questions(tmp_path):
    a, r = load_golden(write(tmp_path, ANSWER, REFUSE), SETS)
    assert isinstance(a, Question)
    assert a.pages == (10, 11)
    assert a.must_contain == (("consent", "informed"), ("risk",))
    assert a.must_not_contain == ()
    assert r.expect == "refuse" and r.pages == ()


def test_blank_lines_are_skipped(tmp_path):
    assert len(load_golden(write(tmp_path, ANSWER, "", "   ", REFUSE), SETS)) == 2


@pytest.mark.parametrize("bad", [
    "{not json",
    {**REFUSE, "id": "x", "set": "zzz"},                           # unknown set
    {k: v for k, v in REFUSE.items() if k != "q"} | {"id": "x"},   # missing q
    {**REFUSE, "id": "x", "expect": "maybe"},                      # unknown expect
    {**ANSWER, "id": "x", "pages": []},                            # answer without pages
    {**ANSWER, "id": "x", "file": ""},                             # answer without file
    {**REFUSE},                                                    # duplicate id (n01 again)
    {**ANSWER, "id": "x", "must_contain": ["three", "3"]},         # flat list: would load as letters
    {**ANSWER, "id": "x", "must_contain": [[]]},                   # empty group: always fails
    {**ANSWER, "id": "x", "file": "Ethics.pdf"},                   # file not in the set (capital E)
    {**ANSWER, "id": "x", "pages": ["7"]},                         # page as text, never equals 7
    {**ANSWER, "id": "x", "pages": [0]},                           # pages start at 1
    {**ANSWER, "id": "x", "kind": "Trap"},                         # unknown kind would mix into averages
])
def test_bad_line_names_its_line_number(tmp_path, bad):
    with pytest.raises(GoldenError, match=r"^golden.jsonl line 2: "):
        load_golden(write(tmp_path, REFUSE, bad), SETS)


def test_also_ok_pages_are_loaded_as_a_tuple(tmp_path):
    (q,) = load_golden(write(tmp_path, {**ANSWER, "also_ok_pages": [8]}), SETS)
    assert q.also_ok_pages == (8,)
