"""Turn the raw text the LLM wrote into something we can trust: cleaned text + valid citations, or a refusal.

Pure function: no database, no network. The LLM only ever writes a number like [2].
This module decides which numbers are real; the file name and page come later, from the database.
"""

import re
from dataclasses import dataclass

from app.rag.prompt import REFUSAL

# A bracket holding only numbers and commas: [1]  [12]  [1, 2]  [ 3 ,4 ]. Not [sic], not [a1].
# Group 1 captures the spaces/tabs just BEFORE the bracket, so a removed marker can take
# its own gap with it ("Invented [9]." -> "Invented.") without touching the rest of the text.
_GROUP = re.compile(r"([ \t]*)\[\s*\d+(?:\s*,\s*\d+)*\s*\]")
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
    #    The cleanup happens HERE, only where a marker was, so all other formatting
    #    (indented code, lists, "3 : 1") stays exactly as the model wrote it.
    def keep_valid(match: re.Match) -> str:
        space_before = match.group(1)
        numbers = [int(x) for x in re.findall(r"\d+", match.group()) if len(x) <= 6]
        markers = "".join(f"[{n}]" for n in numbers if 1 <= n <= passage_count)
        return space_before + markers if markers else ""   # nothing valid: drop the marker AND its gap

    text = _GROUP.sub(keep_valid, raw).strip()

    # 2. Does the reply START with the refusal sentence (give or take quotes, capitals, markers)?
    #    Small models often refuse and then add a remark, sometimes with a citation:
    #    "Not found in your documents. The passages only cover volcanoes [3]." is still a refusal.
    #    "Starts with", not "contains": an answer may legitimately say it later about a side point.
    bare = _MARKER.sub("", text).strip(" \t\n\"'“”‘’.").lower()
    if bare.startswith(_REFUSAL_BARE):
        return _REFUSED

    # 3. Which passages are cited? dict.fromkeys keeps first-seen order and drops repeats.
    cited = list(dict.fromkeys(int(n) for n in _MARKER.findall(text)))

    # 4. A claim with no checkable source is not allowed out.
    if not cited:
        return _REFUSED

    return ParsedAnswer(text=text, cited=cited, refused=False)
