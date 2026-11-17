"""Load the golden set: the questions whose right answers we already know.

One JSON object per line (JSON Lines). Every mistake is reported with its line number,
before any slow work starts: a typo should cost a second, not a 5-minute run.
"""

import json
from dataclasses import dataclass
from pathlib import Path

REQUIRED = ("id", "set", "q", "expect")
EXPECTS = {"answer", "refuse"}


class GoldenError(ValueError):
    """A line in golden.jsonl is wrong. The message starts with 'golden.jsonl line <n>: '."""


@dataclass(frozen=True)
class Question:
    id: str
    set: str                 # which document set (= temporary workspace) to search
    q: str                   # the question, as a user would type it
    expect: str              # "answer" or "refuse"
    file: str = ""           # where the answer is (expect == "answer")
    pages: tuple[int, ...] = ()
    must_contain: tuple[tuple[str, ...], ...] = ()   # every group needs one of its words
    must_not_contain: tuple[str, ...] = ()
    kind: str = ""           # direct, paraphrase, multi_page, not_in_docs, trap (reporting only)
    note: str = ""


def _question(raw: dict, known_sets: set[str]) -> Question:
    missing = [key for key in REQUIRED if not raw.get(key)]
    if missing:
        raise ValueError(f"missing {', '.join(missing)}")
    if raw["expect"] not in EXPECTS:
        raise ValueError(f"expect must be 'answer' or 'refuse', got {raw['expect']!r}")
    if raw["set"] not in known_sets:
        raise ValueError(f"unknown set {raw['set']!r} (known: {', '.join(sorted(known_sets))})")
    if raw["expect"] == "answer" and not (raw.get("file") and raw.get("pages")):
        raise ValueError("an 'answer' question needs a file and at least one page")
    return Question(
        id=raw["id"], set=raw["set"], q=raw["q"], expect=raw["expect"],
        file=raw.get("file", ""),
        pages=tuple(raw.get("pages", ())),
        must_contain=tuple(tuple(group) for group in raw.get("must_contain", ())),
        must_not_contain=tuple(raw.get("must_not_contain", ())),
        kind=raw.get("kind", ""), note=raw.get("note", ""),
    )


def load_golden(path: Path, known_sets: set[str]) -> list[Question]:
    questions: list[Question] = []
    seen: set[str] = set()
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            question = _question(json.loads(line), known_sets)
            if question.id in seen:
                raise ValueError(f"duplicate id {question.id!r}")
        except (ValueError, TypeError, AttributeError) as exc:   # JSONDecodeError is a ValueError
            raise GoldenError(f"golden.jsonl line {n}: {exc}") from exc
        seen.add(question.id)
        questions.append(question)
    return questions
