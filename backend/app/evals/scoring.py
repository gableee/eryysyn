"""Score eval answers. Pure functions: no database, no network, no model.

Retrieval and answer are scored separately, so a bad answer points at the stage that failed:
the right page never reached the model (retrieval), or it did and the answer was still wrong.
"""

from __future__ import annotations

import statistics
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
    recall: float = 0.0       # distinct expected pages found / expected pages (completeness)
    precision: float = 0.0    # chunks on an expected page / chunks returned (noise)


def _on_target(q: Question, h: SearchHit) -> bool:
    return h.filename == q.file and h.page in q.pages


def _citable(q: Question, h: SearchHit) -> bool:
    """A page the answer may cite: an expected page, or one the golden set marks as also fine."""
    return h.filename == q.file and (h.page in q.pages or h.page in q.also_ok_pages)


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
    on_target = [h for h in hits if _on_target(q, h)]
    recall = len({h.page for h in on_target}) / len(q.pages)       # pages, not chunks: p10 twice = 1 page
    precision = len(on_target) / len(hits) if hits else 0.0
    citation_ok = (not parsed.refused and bool(parsed.cited)
                   and all(_citable(q, hits[n - 1]) for n in parsed.cited))
    keywords_ok = _keywords_ok(q, parsed.text)

    failed = tuple(name for name, bad in (
        ("retrieval", not hit),
        ("false_refusal", parsed.refused),
        ("citation", not parsed.refused and not citation_ok),
        ("keywords", not parsed.refused and not keywords_ok),
    ) if bad)
    return Scores(hit=hit, rr=1 / rank if hit else 0.0, refused=parsed.refused,
                  citation_ok=citation_ok, keywords_ok=keywords_ok,
                  correct=not parsed.refused and citation_ok and keywords_ok, failed=failed,
                  recall=recall, precision=precision)


# --- A whole run --------------------------------------------------------------------------

@dataclass(frozen=True)
class Result:
    question: Question
    scores: Scores
    seconds: float                            # search + model + parse, for this question
    retrieved: list[tuple[str, int, float]]   # (filename, page, score) in rank order
    answer: str                               # what the user would have seen


def _ratio(part: int | float, whole: int) -> float:
    return part / whole if whole else 0.0      # an empty group scores 0, not ZeroDivisionError


def _by_kind(results: list[Result]) -> dict[str, list[int]]:
    """{kind: [correct, total]}: one line that shows which TYPE of question fails."""
    counts: dict[str, list[int]] = {}
    for r in results:
        pair = counts.setdefault(r.question.kind or "-", [0, 0])
        pair[0] += r.scores.correct
        pair[1] += 1
    return counts


def summarize(results: list[Result]) -> dict:
    # Traps are reported one by one; mixing them into the averages would hide them.
    answers = [r for r in results if r.question.expect == "answer" and r.question.kind != "trap"]
    refusals = [r for r in results if r.question.expect == "refuse"]
    not_refused = [r for r in answers if not r.scores.refused]
    hits = sum(r.scores.hit for r in answers)          # True counts as 1, False as 0
    return {
        "questions": len(results),
        "hits": hits,
        "answer_total": len(answers),
        "hit_at_k": _ratio(hits, len(answers)),
        "mrr": _ratio(sum(r.scores.rr for r in answers), len(answers)),
        "recall_at_k": _ratio(sum(r.scores.recall for r in answers), len(answers)),
        "precision_at_k": _ratio(sum(r.scores.precision for r in answers), len(answers)),
        "by_kind": _by_kind(results),
        "answered_correct": sum(r.scores.correct for r in answers),
        "answered_total": len(answers),
        "false_refusals": sum(r.scores.refused for r in answers),
        "citation_ok": sum(r.scores.citation_ok for r in not_refused),
        "citation_total": len(not_refused),
        "refused_correct": sum(r.scores.correct for r in refusals),
        "refuse_total": len(refusals),
        "traps": {r.question.id: r.scores.correct for r in results if r.question.kind == "trap"},
        "median_seconds": statistics.median(r.seconds for r in results) if results else 0.0,
    }


def format_summary(s: dict, model: str, k: int) -> str:
    traps = "  ".join(f"{qid} {'✓' if ok else '✗'}" for qid, ok in s["traps"].items()) or "-"
    return "\n".join([
        f"model {model} · k {k} · {s['questions']} questions",
        f"retrieval   Hit@{k} {s['hit_at_k']:.0%} ({s['hits']}/{s['answer_total']})   MRR {s['mrr']:.2f}   "
        f"Recall@{k} {s['recall_at_k']:.2f}   Precision@{k} {s['precision_at_k']:.2f}",
        f"answers     correct {s['answered_correct']}/{s['answered_total']}   "
        f"false refusals {s['false_refusals']}/{s['answered_total']}   "
        f"citation ok {s['citation_ok']}/{s['citation_total']}",
        f"refusals    {s['refused_correct']}/{s['refuse_total']} not-in-docs refused",
        f"traps       {traps}",
        "by kind     " + " · ".join(f"{kind} {c}/{t}" for kind, (c, t) in s["by_kind"].items()),
        f"time        {s['median_seconds']:.1f} s/answer (median)",
    ])


def format_failures(results: list[Result]) -> str:
    blocks = []
    for r in results:
        if r.scores.correct:
            continue
        q = r.question
        expected = (f"{q.file} p.{', '.join(map(str, q.pages))}" if q.expect == "answer"
                    else "a refusal")
        retrieved = " · ".join(f"{f} p.{p} {score:.2f}" for f, p, score in r.retrieved) or "-"
        blocks.append("\n".join([
            f"✗ {q.id} [{', '.join(r.scores.failed)}]  {q.q}",
            f"  expected   {expected}",
            f"  retrieved  {retrieved}",
            f"  answer     {r.answer}",
        ]))
    return "\n\n".join(blocks) if blocks else "No failures."
