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
# The same marker repeated right after itself: "[2][2]". \1 = "whatever group 1 matched".
_REPEATED = re.compile(r"(\[\d+\])\1+")
# Code: a ```fenced block``` (may span lines) or `inline code` (one line).
# The outer ( ) makes re.split KEEP the code pieces in its result, at the odd positions.
_CODE = re.compile(r"(```.*?```|`[^`\n]*`)", re.DOTALL)


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

    #    Only the prose is processed. Code is not ours to edit, and "items[1]" in code is not a
    #    citation. re.split with a capturing group returns [prose, code, prose, code, prose, ...]:
    #    even positions are prose, odd positions are code.
    parts = _CODE.split(raw)
    for i in range(0, len(parts), 2):
        parts[i] = _REPEATED.sub(r"\1", _GROUP.sub(keep_valid, parts[i]))   # "[2][2]" -> "[2]"
    text = "".join(parts).strip()
    prose = "".join(parts[0::2])     # every second item from 0: the prose pieces only

    # 2. Does the reply START with the refusal sentence (give or take quotes, capitals, markers)?
    #    Small models often refuse and then add a remark, sometimes with a citation:
    #    "Not found in your documents. The passages only cover volcanoes [3]." is still a refusal.
    #    "Starts with", not "contains": an answer may legitimately say it later about a side point.
    bare = _MARKER.sub("", text).strip(" \t\n\"'“”‘’.").lower()
    if bare.startswith(_REFUSAL_BARE):
        return _REFUSED

    # 3. Which passages are cited? dict.fromkeys keeps first-seen order and drops repeats.
    #    Counted in the prose only, so brackets inside code never count as citations.
    cited = list(dict.fromkeys(int(n) for n in _MARKER.findall(prose)))

    # 4. A claim with no checkable source is not allowed out.
    if not cited:
        return _REFUSED

    return ParsedAnswer(text=text, cited=cited, refused=False)
