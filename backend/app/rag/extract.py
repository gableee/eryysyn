import re
import statistics

import pymupdf

# A vertical gap bigger than this many "normal line gaps" starts a new paragraph.
PARAGRAPH_GAP_FACTOR = 1.4


def _page_text(page: pymupdf.Page) -> str:
    """Rebuild one page's text, keeping paragraph breaks as blank lines."""
    # Each block: (x0, y0, x1, y1, text, block_no, block_type). type 0 = text.
    blocks = [b for b in page.get_text("blocks") if b[6] == 0]
    if not blocks:
        return ""

    tops = [b[1] for b in blocks]
    gaps = [b - a for a, b in zip(tops, tops[1:]) if b > a]
    normal_gap = statistics.median(gaps) if gaps else 0

    paragraphs: list[list[str]] = [[]]
    for i, block in enumerate(blocks):
        if i > 0 and normal_gap and (tops[i] - tops[i - 1]) > normal_gap * PARAGRAPH_GAP_FACTOR:
            paragraphs.append([])
        paragraphs[-1].append(block[4].strip())

    return "\n\n".join(" ".join(lines) for lines in paragraphs)


def clean_text(text: str) -> str:
    """Whitespace cleanup only. Paragraph breaks (blank lines) are kept."""
    text = re.sub(r"[ \t]+", " ", text)      # collapse runs of spaces/tabs
    text = re.sub(r"\n{3,}", "\n\n", text)   # max one blank line
    return text.strip()


def extract_pages(pdf_bytes: bytes) -> list[tuple[int, str]]:
    """Return [(page_number, text), ...] with page_number starting at 1."""
    pages = []
    with pymupdf.open(stream=pdf_bytes, filetype="pdf") as doc:
        for i, page in enumerate(doc, start=1):
            text = clean_text(_page_text(page))
            if text:  # skip blank or image-only pages
                pages.append((i, text))
    return pages
