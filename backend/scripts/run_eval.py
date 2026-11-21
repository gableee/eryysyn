"""Run the golden set through the REAL pipeline and score it. Saves a results file per run.

Usage (from backend/):
    PYTHONPATH=. python scripts/run_eval.py                      # model from OLLAMA_MODEL
    PYTHONPATH=. python scripts/run_eval.py --model qwen3.5:9b
    PYTHONPATH=. python scripts/run_eval.py --only e01,d2 --k 3
    PYTHONPATH=. python scripts/run_eval.py --golden evals/golden_followup.jsonl --followup none

Phases (fail fast: every cheap check runs before the slow work):
    1. load + validate golden.jsonl         (a typo stops here, in under a second)
    2. warm up the model                    (Ollama down or wrong name stops here)
    3. temporary workspaces, one per set    (always deleted, also on errors and Ctrl+C)
    4. each question through draft_answer   (the API's own pipeline, not a copy). A question with
       earlier "turns" is played turn by turn (evals/followup.py); only its last turn is scored.
    5. print summary + failures, save evals/results/<date>_<model>.json
"""

import argparse
import json
import subprocess
import sys
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND / ".env")   # TEST_USER_A_EMAIL (owner of the eval workspaces)

from app.core.config import settings                                    # noqa: E402
from app.db.session import pool                                         # noqa: E402
from app.evals.followup import MODES, play                              # noqa: E402
from app.evals.golden import GoldenError, load_golden                   # noqa: E402
from app.evals.scoring import (Result, format_failures, format_summary,  # noqa: E402
                               model_error_result, score_question, summarize)
from app.evals.sets import SETS                                         # noqa: E402
from app.evals.workspaces import eval_owner_id, eval_workspaces         # noqa: E402
from app.llm import client as llm                                       # noqa: E402
from app.rag.models import EMBEDDING_MODEL                              # noqa: E402
from app.services.retrieval import DEFAULT_K                            # noqa: E402


def git_commit() -> str:
    """Which code produced these numbers. '+dirty' = uncommitted changes, so not reproducible."""
    def git(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=BACKEND, capture_output=True, text=True).stdout.strip()
    # Results files from earlier runs are outputs, not code: they must not make the tree "dirty".
    changed = git("status", "--porcelain", "--", ".", ":(exclude)evals/results")
    return (git("rev-parse", "--short", "HEAD") or "unknown") + ("+dirty" if changed else "")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=settings.ollama_model)
    parser.add_argument("--only", default="", help="comma-separated question ids")
    parser.add_argument("--k", type=int, default=DEFAULT_K)
    parser.add_argument("--golden", type=Path, default=BACKEND / "evals" / "golden.jsonl")
    parser.add_argument("--followup", choices=MODES, default="rewrite",
                        help="how earlier turns are used: none, concat (baseline) or rewrite (the chat)")
    args = parser.parse_args()
    settings.ollama_model = args.model     # generate() reads this at call time
    commit = git_commit()                  # read BEFORE the run: the code and rules this run uses

    # 1. golden set
    try:
        questions = load_golden(args.golden, {name: {d.filename for d in docs} for name, docs in SETS.items()})
    except (GoldenError, FileNotFoundError) as exc:
        print(exc)
        return 1
    if args.only:
        wanted = args.only.split(",")
        unknown = set(wanted) - {q.id for q in questions}
        if unknown:
            print(f"unknown question ids: {', '.join(sorted(unknown))}")
            return 1
        questions = [q for q in questions if q.id in wanted]

    # 2. model reachable? (also loads it into memory, so the first question's time is fair)
    try:
        llm.generate("Reply with one word.", "Say OK.")
    except llm.LLMError as exc:
        print(f"Model {args.model} not available at {settings.ollama_url}: {exc}")
        return 1

    # 3 + 4. workspaces and questions
    set_names = list(dict.fromkeys(q.set for q in questions))     # in order of first use, no repeats
    print(f"indexing sets: {', '.join(set_names)} ...")
    results: list[Result] = []
    raws: dict[str, str | None] = {}
    played: dict[str, list[dict]] = {}       # per question: every turn's typed and searched text
    with eval_workspaces(eval_owner_id(), set_names) as workspaces:
        for i, q in enumerate(questions, start=1):
            start = time.perf_counter()
            try:
                draft, turns = play(workspaces[q.set], q, args.followup, k=args.k)
            except llm.LLMError as exc:       # one failed question must not lose the others
                results.append(model_error_result(q, time.perf_counter() - start, str(exc)))
                raws[q.id] = None
                played[q.id] = []
                print(f"[{i}/{len(questions)}] {q.id:<5} ! model error: {exc}")
                continue
            seconds = turns[-1]["seconds"]    # the scored turn only: comparable with single questions
            played[q.id] = turns
            scores = score_question(q, draft.hits, draft.parsed)
            results.append(Result(
                question=q, scores=scores, seconds=seconds,
                retrieved=[(h.filename, h.page, round(h.score, 3)) for h in draft.hits],
                answer=draft.parsed.text,
            ))
            raws[q.id] = draft.raw
            print(f"[{i}/{len(questions)}] {q.id:<5} {'✓' if scores.correct else '✗'} {seconds:.1f}s")

    # 5. report and save
    summary = summarize(results)
    print("\n" + format_summary(summary, args.model, args.k) + "\n")
    print(format_failures(results))

    out_dir = BACKEND / "evals" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")   # seconds: two runs in one minute must not overwrite
    name = f"{stamp}_{args.model.replace(':', '-').replace('/', '-')}"
    if any(q.turns for q in questions):       # only runs with multi-turn cases depend on the mode
        name += f"_followup-{args.followup}"
    out = out_dir / f"{name}.json"
    out.write_text(json.dumps({
        "settings": {"model": args.model, "k": args.k, "embedding_model": EMBEDDING_MODEL,
                     "commit": commit, "golden": args.golden.name, "date": stamp,
                     "followup": args.followup},
        "summary": summary,
        "results": [
            {"id": r.question.id, "set": r.question.set, "kind": r.question.kind,
             "expect": r.question.expect, "q": r.question.q, "seconds": round(r.seconds, 2),
             "retrieved": r.retrieved, "answer": r.answer, "raw": raws[r.question.id],
             "turns": played[r.question.id],
             "scores": asdict(r.scores)}
            for r in results
        ],
    }, indent=2, ensure_ascii=False))
    print(f"\nsaved {out.relative_to(BACKEND)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        pool.close()   # stop the pool's threads cleanly (no "couldn't stop thread" warnings)
