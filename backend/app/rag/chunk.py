import logging
import re
from dataclasses import dataclass
from functools import lru_cache

from transformers import AutoTokenizer

from app.rag.models import EMBEDDING_MODEL

log = logging.getLogger(__name__)

DEFAULT_MAX_TOKENS = 250 # well under bge-small's 512 limit, which drops text silently
HEADING_MAX_WORDS = 12


@dataclass(frozen=True)
class Chunk:
    page: int
    chunk_index: int  # 0-based, counts across the whole document
    text: str


@lru_cache(maxsize=1)
def _tokenizer():
    return AutoTokenizer.from_pretrained(EMBEDDING_MODEL)


def count_tokens(text: str) -> int:
    return len(_tokenizer().encode(text, add_special_tokens=False))


def _is_heading(paragraph: str) -> bool:
    """Short and not ending like a sentence, e.g. 'Responsibilities to Employers'."""
    return len(paragraph.split()) <= HEADING_MAX_WORDS and not paragraph.rstrip().endswith(
        (".", "!", "?", ":", '"', "”")
    )


def _attach_headings(paragraphs: list[str]) -> list[str]:
    """Glue each heading to the paragraph after it, so a heading is never alone."""
    units: list[str] = []
    pending = ""
    for i, p in enumerate(paragraphs):
        is_last = i == len(paragraphs) - 1
        if pending:
            p = pending + "\n\n" + p
            pending = ""
        if _is_heading(p) and not is_last:
            pending = p
        else:
            units.append(p)
    if pending:
        units.append(pending)
    return units


def _split_long(unit: str, max_tokens: int) -> list[str]:
    """Split a too-long unit by sentence; hard-split by words if one sentence is still too long."""
    sentences = re.split(r"(?<=[.!?])\s+", unit)
    pieces: list[str] = []
    current = ""
    for s in sentences:
        candidate = f"{current} {s}".strip()
        if count_tokens(candidate) <= max_tokens:
            current = candidate
            continue
        if current:
            pieces.append(current)
        current = ""
        if count_tokens(s) <= max_tokens:
            current = s
        else:  # a single huge sentence: cut by words
            for word in s.split():
                candidate = f"{current} {word}".strip()
                if count_tokens(candidate) <= max_tokens:
                    current = candidate
                else:
                    if current:  # never emit an empty piece
                        pieces.append(current)
                    current = word
                    if count_tokens(word) > max_tokens:
                        # One unbroken string over the limit (URL, hash...). We keep it whole;
                        # the embedder will truncate it, so say so instead of failing silently.
                        log.warning(
                            "Unsplittable text over %d tokens kept as one chunk (starts %r)",
                            max_tokens,
                            word[:40],
                        )
    if current:
        pieces.append(current)
    return pieces


def _chunk_page_text(text: str, max_tokens: int) -> list[str]:
    units = _attach_headings([p for p in text.split("\n\n") if p.strip()])
    chunks: list[str] = []
    current = ""
    for unit in units:
        if count_tokens(unit) > max_tokens:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(_split_long(unit, max_tokens))
            continue
        candidate = f"{current}\n\n{unit}" if current else unit
        if count_tokens(candidate) <= max_tokens:
            current = candidate
        else:
            chunks.append(current)
            current = unit
    if current:
        chunks.append(current)
    return chunks


def chunk_pages(
    pages: list[tuple[int, str]], max_tokens: int = DEFAULT_MAX_TOKENS
) -> list[Chunk]:
    """Cut each page into chunks of whole paragraphs. A chunk never crosses a page (ADR-004)."""
    chunks: list[Chunk] = []
    for page_number, text in pages:
        for chunk_text in _chunk_page_text(text, max_tokens):
            chunks.append(Chunk(page=page_number, chunk_index=len(chunks), text=chunk_text))
    return chunks
