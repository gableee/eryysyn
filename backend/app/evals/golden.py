"""Load the golden set: the questions whose right answers we already know.

One JSON object per line (JSON Lines). Every mistake is reported with its line number,
before any slow work starts: a typo should cost a second, not a 5-minute run.
"""

import json
from dataclasses import dataclass
from pathlib import Path

REQUIRED = ("id", "set", "q", "expect")
EXPECTS = {"answer", "refuse"}
KINDS = {"", "direct", "paraphrase", "multi_page", "not_in_docs", "trap", "negation",
         # held-out set: kinds of question the dev set never had
         "conflict", "near_conflict", "false_premise", "leading", "injection", "messy",
         "follow_up"}


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
    also_ok_pages: tuple[int, ...] = ()            # fine to CITE, but not a page search must find
    must_contain: tuple[tuple[str, ...], ...] = ()   # every group needs one of its words
    must_not_contain: tuple[str, ...] = ()
    kind: str = ""           # direct, paraphrase, multi_page, not_in_docs, trap (reporting only)
    note: str = ""
    instructions: str = ""   # the chat's tone instructions, as a user would set them (untrusted)
    turns: tuple[str, ...] = ()   # earlier messages of the chat, in order; q is the one being scored


def _question(raw: dict, sets: dict[str, set[str]]) -> Question:
    missing = [key for key in REQUIRED if not raw.get(key)]
    if missing:
        raise ValueError(f"missing {', '.join(missing)}")
    if raw["expect"] not in EXPECTS:
        raise ValueError(f"expect must be 'answer' or 'refuse', got {raw['expect']!r}")
    if raw["set"] not in sets:
        raise ValueError(f"unknown set {raw['set']!r} (known: {', '.join(sorted(sets))})")
    if raw.get("kind", "") not in KINDS:
        raise ValueError(f"unknown kind {raw['kind']!r} (known: {', '.join(sorted(KINDS - {''}))})")
    if raw["expect"] == "answer":
        if not (raw.get("file") and raw.get("pages")):
            raise ValueError("an 'answer' question needs a file and at least one page")
        if raw["file"] not in sets[raw["set"]]:
            raise ValueError(f"file {raw['file']!r} is not in set {raw['set']!r} "
                             f"(has: {', '.join(sorted(sets[raw['set']]))})")
    for field in ("pages", "also_ok_pages"):
        # bool is a subclass of int in Python, so True would pass isinstance(p, int) without this
        if not all(isinstance(p, int) and not isinstance(p, bool) and p >= 1 for p in raw.get(field, [])):
            raise ValueError(f"{field} must be whole numbers from 1, e.g. [7], not [\"7\"]")
    if not isinstance(raw.get("instructions", ""), str):
        raise ValueError("instructions must be text")
    turns = raw.get("turns", [])
    if not (isinstance(turns, list) and all(isinstance(t, str) and t.strip() for t in turns)):
        raise ValueError('turns must be a list of non-empty messages, e.g. ["What is X?", "why"]')
    groups = raw.get("must_contain", [])
    if not all(isinstance(g, list) and g and all(isinstance(w, str) for w in g) for g in groups):
        raise ValueError('must_contain must be a list of non-empty lists, e.g. [["three", "3"]]')
    return Question(
        id=raw["id"], set=raw["set"], q=raw["q"], expect=raw["expect"],
        file=raw.get("file", ""),
        pages=tuple(raw.get("pages", ())),
        also_ok_pages=tuple(raw.get("also_ok_pages", ())),
        must_contain=tuple(tuple(group) for group in groups),
        must_not_contain=tuple(raw.get("must_not_contain", ())),
        kind=raw.get("kind", ""), note=raw.get("note", ""),
        instructions=raw.get("instructions", ""),
        turns=tuple(turns),
    )


def load_golden(path: Path, sets: dict[str, set[str]]) -> list[Question]:
    """sets = {set name: the file names in that set}, so a typo in "file" is caught here."""
    questions: list[Question] = []
    seen: set[str] = set()
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            question = _question(json.loads(line), sets)
            if question.id in seen:
                raise ValueError(f"duplicate id {question.id!r}")
        except (ValueError, TypeError, AttributeError) as exc:   # JSONDecodeError is a ValueError
            raise GoldenError(f"golden.jsonl line {n}: {exc}") from exc
        seen.add(question.id)
        questions.append(question)
    return questions
