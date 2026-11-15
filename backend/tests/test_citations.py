import pytest

from app.rag.citations import ParsedAnswer, parse_answer
from app.rag.prompt import REFUSAL

REFUSED = ParsedAnswer(text=REFUSAL, cited=[], refused=True)


def test_valid_citations_are_kept_in_order_of_first_appearance():
    p = parse_answer("B is true [2]. A is true [1]. Again [2].", passage_count=3)
    assert p == ParsedAnswer("B is true [2]. A is true [1]. Again [2].", [2, 1], False)


def test_citation_to_a_passage_that_was_not_sent_is_removed():
    p = parse_answer("Real [1]. Invented [9]. Zero [0].", passage_count=2)
    assert p.cited == [1]
    assert "[9]" not in p.text and "[0]" not in p.text and "Real [1]." in p.text


def test_grouped_citations_are_split():
    p = parse_answer("Both say so [1, 2]. And [2][3].", passage_count=3)
    assert p.cited == [1, 2, 3]
    assert "[1][2]" in p.text


def test_grouped_citation_keeps_only_the_valid_numbers():
    p = parse_answer("Mixed [1, 9].", passage_count=2)
    assert p.cited == [1] and "[1]" in p.text and "9" not in p.text


def test_other_brackets_are_left_alone():
    p = parse_answer("He wrote [sic] this [1].", passage_count=1)
    assert "[sic]" in p.text and p.cited == [1]


@pytest.mark.parametrize("raw", [
    REFUSAL,
    "  Not found in your documents.\n",
    "Not found in your documents",
    "not found in your documents.",
    '"Not found in your documents."',
    "Not found in your documents. [1]",
])
def test_refusal_in_any_small_variation_is_a_clean_refusal(raw):
    assert parse_answer(raw, passage_count=2) == REFUSED


def test_an_answer_with_no_valid_citation_becomes_a_refusal():
    assert parse_answer("Paris is the capital of France.", passage_count=2) == REFUSED
    assert parse_answer("Paris is the capital [7].", passage_count=2) == REFUSED


def test_empty_reply_is_a_refusal():
    assert parse_answer("   ", passage_count=2) == REFUSED
