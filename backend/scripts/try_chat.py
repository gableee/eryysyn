"""Ask one question against the REAL model and print every stage. Nothing is saved.

Usage (from backend/):
    PYTHONPATH=. python scripts/try_chat.py <workspace_id> "<question>" ["<chat instructions>"]
    OLLAMA_MODEL=qwen3.5:9b PYTHONPATH=. python scripts/try_chat.py <workspace_id> "<question>"

It runs services.chat.draft_answer, the SAME code the API uses, so what you see here is what
a user would get (minus saving).

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
from app.services.chat import draft_answer


def main() -> None:
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    workspace_id, question = uuid.UUID(sys.argv[1]), sys.argv[2]
    instructions = sys.argv[3] if len(sys.argv) == 4 else ""

    print(f"MODEL         {settings.ollama_model}")
    print(f"QUESTION      {question}")
    print(f"INSTRUCTIONS  {instructions or '(none)'}\n")

    started = time.time()
    d = draft_answer(workspace_id, question, instructions)
    seconds = time.time() - started

    print("RETRIEVED")
    for n, h in enumerate(d.hits, start=1):
        print(f"  [{n}] {h.filename}  p.{h.page}  score {h.score:.3f}  ({len(h.text)} chars)")
    if d.raw is None:
        print("  (nothing: empty workspace -> refusal, model not called)")
        return

    print(f"\n--- SYSTEM TEXT ---\n{d.system}")
    print(f"\n--- USER TEXT ---\n{d.user}")
    print(f"\n--- RAW MODEL REPLY ({seconds:.1f} s, includes retrieval) ---\n{d.raw}")

    p = d.parsed
    print("\n--- AFTER OUR CHECKS ---")
    print(f"refused  {p.refused}")
    print(f"cited    {p.cited}  -> pages {[d.hits[n - 1].page for n in p.cited]}")
    print(f"text     {p.text}")


if __name__ == "__main__":
    try:
        main()
    finally:
        pool.close()   # otherwise the connection pool's background threads delay exit
