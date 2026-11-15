"""Turn the raw text the LLM wrote into something we can trust: cleaned text + valid citations, or a refusal.

Pure function: no database, no network. The LLM only ever writes a number like [2].
This module decides which numbers are real; the file name and page come later, from the database.
"""

import re
from dataclasses import dataclass

from app.rag.prompt import REFUSAL

# A bracket holding only numbers and commas: [1]  [12]  [1, 2]  [ 3 ,4 ]. Not [sic], not [a1].
_GROUP = re.compile(r"\[\s*\d+(?:\s*,\s*\d+)*\s*\]")
# A single clean marker, after normalising: [1]
_MARKER = re.compile(r"\[(\d+)\]")


@dataclass(frozen=True)
class ParsedAnswer:
    text: str          # what we show the user
    cited: list[int]   # passage numbers used, in order of first appearance, no repeats
    refused: bool      # True = "Not found in your documents."


_REFUSED = ParsedAnswer(text=REFUSAL, cited=[], refused=True)
_REFUSAL_BARE = REFUSAL.rstrip(".").lower()   # "not found in your documents"


def parse_answer(raw: str, passage_count: int) -> ParsedAnswer:
    """Validate the model's reply against the passages we actually sent (numbered 1..passage_count)."""

    # 1. Rewrite every numeric bracket as separate markers, keeping only numbers that exist.
    #    "[1, 9]" with 2 passages -> "[1]".   "[9]" -> "" (the model invented it).
    #    Numbers longer than 6 digits are skipped before int(): no passage number is that big, and
    #    Python raises ValueError when asked to convert a string of more than 4300 digits.
    def keep_valid(match: re.Match) -> str:
        numbers = [int(x) for x in re.findall(r"\d+", match.group()) if len(x) <= 6]
        return "".join(f"[{n}]" for n in numbers if 1 <= n <= passage_count)

    text = _GROUP.sub(keep_valid, raw)

    # 2. A removed marker leaves a gap: "Invented ." -> "Invented."
    text = re.sub(r"[ \t]+([.,;:])", r"\1", text)
    text = re.sub(r"[ \t]{2,}", " ", text).strip()

    # 3. Is it the refusal sentence, give or take quotes, capitals, a full stop or a stray marker?
    bare = _MARKER.sub("", text).strip(" \t\n\"'“”‘’.").lower()
    if bare == _REFUSAL_BARE:
        return _REFUSED

    # 4. Which passages are cited? dict.fromkeys keeps first-seen order and drops repeats.
    cited = list(dict.fromkeys(int(n) for n in _MARKER.findall(text)))

    # 5. A claim with no checkable source is not allowed out.
    if not cited:
        return _REFUSED

    return ParsedAnswer(text=text, cited=cited, refused=False)
