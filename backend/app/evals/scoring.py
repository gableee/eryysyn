"""Score eval answers. Pure functions: no database, no network, no model.

Retrieval and answer are scored separately, so a bad answer points at the stage that failed:
the right page never reached the model (retrieval), or it did and the answer was still wrong.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.evals.golden import Question

if TYPE_CHECKING:   # for type hints only: importing retrieval for real would open a DB pool
    from app.rag.citations import ParsedAnswer
    from app.services.retrieval import SearchHit


@dataclass(frozen=True)
class Scores:
    hit: bool            # an expected page is among the retrieved chunks
    rr: float            # reciprocal rank: 1 / position of the first expected page, 0 if none
    refused: bool
    citation_ok: bool    # every cited [n] points at an expected page
    keywords_ok: bool    # must_contain groups all present, no must_not_contain term
    correct: bool        # the one verdict per question
    failed: tuple[str, ...]   # which rules failed, for the failure list


def _on_target(q: Question, h: SearchHit) -> bool:
    return h.filename == q.file and h.page in q.pages


def _keywords_ok(q: Question, text: str) -> bool:
    text = text.lower()
    has_all_groups = all(any(word.lower() in text for word in group) for group in q.must_contain)
    has_forbidden = any(term.lower() in text for term in q.must_not_contain)
    return has_all_groups and not has_forbidden


def score_question(q: Question, hits: list[SearchHit], parsed: ParsedAnswer) -> Scores:
    if q.expect == "refuse":
        return Scores(hit=False, rr=0.0, refused=parsed.refused, citation_ok=False, keywords_ok=False,
                      correct=parsed.refused, failed=() if parsed.refused else ("not_refused",))

    # Rank of the first chunk on an expected page: 1 for the top result, 0 if none.
    rank = next((i for i, h in enumerate(hits, start=1) if _on_target(q, h)), 0)
    hit = rank > 0
    citation_ok = (not parsed.refused and bool(parsed.cited)
                   and all(_on_target(q, hits[n - 1]) for n in parsed.cited))
    keywords_ok = _keywords_ok(q, parsed.text)

    failed = tuple(name for name, bad in (
        ("retrieval", not hit),
        ("false_refusal", parsed.refused),
        ("citation", not parsed.refused and not citation_ok),
        ("keywords", not parsed.refused and not keywords_ok),
    ) if bad)
    return Scores(hit=hit, rr=1 / rank if hit else 0.0, refused=parsed.refused,
                  citation_ok=citation_ok, keywords_ok=keywords_ok,
                  correct=not parsed.refused and citation_ok and keywords_ok, failed=failed)
