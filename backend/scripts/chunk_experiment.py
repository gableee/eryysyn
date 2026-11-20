"""Offline retrieval experiment: how do chunking options change WHICH pages search finds?

Usage (from backend/):
    PYTHONPATH=. python scripts/chunk_experiment.py

No database, no LLM. It rebuilds the search in memory: chunk the eval PDF, embed the chunks with the
same model as production, and rank them for every ethics question by cosine similarity (the same
math pgvector runs). That makes one option cost seconds instead of a 10-minute eval run.

It measures RETRIEVAL only. An option that looks better here still needs a real eval run.
"""

import json
import statistics
from collections.abc import Callable
from pathlib import Path

import numpy as np

from app.evals.golden import Question, load_golden
from app.evals.sets import EVAL_DOCS, SETS
from app.rag.chunk import Chunk, chunk_pages, count_tokens
from app.rag.embed import embed_passages, embed_query
from app.rag.extract import extract_pages

BACKEND = Path(__file__).resolve().parents[1]
K = 5
TINY = 50          # tokens. Below this a chunk is "tiny" (the 5 found: 2, 3, 14, 25, 36 tokens)
SAVED_RUN = BACKEND / "evals" / "results"


# --- Options: each takes the baseline chunks and returns a new list ---------------------------

def keep(chunks: list[Chunk]) -> list[Chunk]:
    return chunks


def drop_below(n: int) -> Callable[[list[Chunk]], list[Chunk]]:
    def option(chunks: list[Chunk]) -> list[Chunk]:
        return [c for c in chunks if count_tokens(c.text) >= n]
    return option


def merge_tiny(chunks: list[Chunk]) -> list[Chunk]:
    """Glue a tiny chunk onto the previous chunk on the SAME page (else the next one). ADR-004 holds."""
    out: list[Chunk] = []
    carry = ""                                   # a tiny first-on-page chunk waiting for the next one
    for i, c in enumerate(chunks):
        text = f"{carry}\n\n{c.text}" if carry else c.text
        carry = ""
        if count_tokens(c.text) < TINY:
            if out and out[-1].page == c.page:
                out[-1] = Chunk(page=c.page, chunk_index=out[-1].chunk_index, text=f"{out[-1].text}\n\n{text}")
                continue
            nxt = chunks[i + 1] if i + 1 < len(chunks) else None
            if nxt and nxt.page == c.page:
                carry = text
                continue
        out.append(Chunk(page=c.page, chunk_index=len(out), text=text))
    return out


OPTIONS = {
    "A keep (baseline)": keep,
    "B drop < 20 tokens": drop_below(20),
    "B drop < 50 tokens": drop_below(TINY),
    "C merge tiny into neighbour": merge_tiny,
}


# --- Search and metrics ------------------------------------------------------------------------

def top_k(chunk_vectors: np.ndarray, question: str) -> list[tuple[int, float]]:
    """[(chunk position, cosine score)] best first. Vectors are normalized: cosine = dot product."""
    scores = chunk_vectors @ np.array(embed_query(question))
    order = np.argsort(-scores)[:K]
    return [(int(i), float(scores[i])) for i in order]


def evaluate(name: str, chunks: list[Chunk], questions: list[Question]) -> dict:
    vectors = np.array(embed_passages([c.text for c in chunks]))
    tiny = {i for i, c in enumerate(chunks) if count_tokens(c.text) < TINY}
    hits, rrs, precisions, tiny_seen, ranked = 0, [], [], [], {}
    for q in questions:
        top = top_k(vectors, q.q)
        ranked[q.id] = [chunks[i].page for i, _ in top]
        tiny_seen += [(q.id, chunks[i].text, rank) for rank, (i, _) in enumerate(top, 1) if i in tiny]
        if q.expect != "answer":
            continue
        on = [chunks[i].page in q.pages for i, _ in top]
        rank = next((r for r, ok in enumerate(on, 1) if ok), 0)
        hits += rank > 0
        rrs.append(1 / rank if rank else 0.0)
        precisions.append(sum(on) / K)
    n = len(rrs)
    sizes = [count_tokens(c.text) for c in chunks]
    return {"name": name, "chunks": len(chunks), "max_tokens": max(sizes), "median_tokens": statistics.median(sizes),
            "hit": hits, "n": n, "mrr": sum(rrs) / n, "precision": sum(precisions) / n,
            "tiny_seen": tiny_seen, "ranked": ranked}


def saved_pages() -> dict[str, list[int]]:
    """Top-5 pages the REAL database returned, from the latest dev and held-out runs (qwen)."""
    pages = {}
    for f in ("2026-11-20_120017_qwen3.5-9b.json", "2026-11-20_160826_qwen3.5-9b.json"):
        for r in json.loads((SAVED_RUN / f).read_text())["results"]:
            if r["set"] == "ethics":
                pages[r["id"]] = [p for _, p, _ in r["retrieved"]]
    return pages


def main() -> None:
    sets = {n: {d.filename for d in ds} for n, ds in SETS.items()}
    questions = [q for f in ("golden.jsonl", "golden_holdout.jsonl")
                 for q in load_golden(BACKEND / "evals" / f, sets) if q.set == "ethics"]
    baseline = chunk_pages(extract_pages((EVAL_DOCS / "ethics.pdf").read_bytes()))
    results = [evaluate(name, option(baseline), questions) for name, option in OPTIONS.items()]

    # 1. Trust check: does the in-memory search agree with the real database?
    saved = saved_pages()
    same = [qid for qid, pages in saved.items() if results[0]["ranked"][qid] == pages]
    print(f"\n1. TRUST CHECK  same top-{K} pages as the real database: {len(same)}/{len(saved)} questions")
    for qid in sorted(set(saved) - set(same)):
        print(f"   {qid}: database {saved[qid]}  offline {results[0]['ranked'][qid]}")

    # 2. Where do tiny chunks show up?
    print(f"\n2. TINY CHUNKS (< {TINY} tokens) inside the top {K}, baseline")
    for qid, text, rank in results[0]["tiny_seen"]:
        q = next(q for q in questions if q.id == qid)
        print(f"   {qid:<4} rank {rank}  {text[:45]!r:<48} ({q.expect}: {q.q[:45]})")

    # 3. Options side by side
    print(f"\n3. OPTIONS  ({results[0]['n']} answerable ethics questions, dev + held-out)")
    print(f"   {'option':<30}{'chunks':>7}{'median tok':>11}{'max tok':>8}{'Hit@5':>9}{'MRR':>7}"
          f"{'Prec@5':>8}{'tiny in top5':>13}")
    for r in results:
        print(f"   {r['name']:<30}{r['chunks']:>7}{r['median_tokens']:>11.0f}{r['max_tokens']:>8}"
              f"{r['hit']:>5}/{r['n']:<3}{r['mrr']:>7.3f}{r['precision']:>8.3f}{len(r['tiny_seen']):>13}")

    # 4. Which questions changed rank vs the baseline?
    base = results[0]["ranked"]
    for r in results[1:]:
        moved = []
        for q in questions:
            if q.expect != "answer":
                continue
            def first(pages): return next((i for i, p in enumerate(pages, 1) if p in q.pages), 0)
            a, b = first(base[q.id]), first(r["ranked"][q.id])
            if a != b:
                moved.append(f"{q.id} {a or '-'}→{b or '-'}")
        print(f"\n   {r['name']}: rank of first right page changed for {len(moved)} question(s)"
              + (": " + ", ".join(moved) if moved else ""))


if __name__ == "__main__":
    main()
