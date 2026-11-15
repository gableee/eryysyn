"""Ask one question against the REAL model and print every stage. Nothing is saved.

Usage (from backend/):
    PYTHONPATH=. python scripts/try_chat.py <workspace_id> "<question>"
    OLLAMA_MODEL=qwen3.5:9b PYTHONPATH=. python scripts/try_chat.py <workspace_id> "<question>"

When an answer is wrong, read the output top to bottom and find the stage that failed:
  wrong passages  -> retrieval problem
  right passages, clear prompt, wrong answer -> the model
  right answer, wrong citations kept/dropped -> the parser
"""

import sys
import time
import uuid

from app.core.config import settings
from app.db.session import pool
from app.llm import client as llm
from app.rag.citations import parse_answer
from app.rag.prompt import build_prompt
from app.services.retrieval import DEFAULT_K, search_chunks


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    workspace_id, question = uuid.UUID(sys.argv[1]), sys.argv[2]

    print(f"MODEL     {settings.ollama_model}")
    print(f"QUESTION  {question}\n")

    hits = search_chunks(workspace_id, question, DEFAULT_K)
    print("RETRIEVED")
    for n, h in enumerate(hits, start=1):
        print(f"  [{n}] {h.filename}  p.{h.page}  score {h.score:.3f}  ({len(h.text)} chars)")
    if not hits:
        print("  (nothing: empty workspace -> refusal, model not called)")
        return

    system, user = build_prompt(question, hits)
    print(f"\n--- SYSTEM TEXT ---\n{system}")
    print(f"\n--- USER TEXT ---\n{user}")

    started = time.time()
    raw = llm.generate(system, user)
    seconds = time.time() - started
    print(f"\n--- RAW MODEL REPLY ({seconds:.1f} s) ---\n{raw}")

    parsed = parse_answer(raw, len(hits))
    print("\n--- AFTER OUR CHECKS ---")
    print(f"refused  {parsed.refused}")
    print(f"cited    {parsed.cited}  -> pages {[hits[n - 1].page for n in parsed.cited]}")
    print(f"text     {parsed.text}")


if __name__ == "__main__":
    try:
        main()
    finally:
        pool.close()   # otherwise the connection pool's background threads delay exit
