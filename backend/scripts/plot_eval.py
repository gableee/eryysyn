"""Chart eval runs over time: "answers correct" per model, one point per experiment stage.

Usage (from backend/):
    PYTHONPATH=. python scripts/plot_eval.py OUT.png "label=bonsai:FILE,qwen:FILE" "label=..." ...

Every run is RE-SCORED with today's golden set before plotting, so older runs and newer runs are
judged by the same rules (an early run was scored before the "disagree" and too_long checks existed).
Only the checks that can be recomputed from a saved answer are re-applied (forbidden words, length);
retrieval and citation verdicts are taken from the file.
"""

import json
import re
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")                      # draw to a file, no window
import matplotlib.pyplot as plt            # noqa: E402

from app.evals.golden import load_golden   # noqa: E402
from app.evals.scoring import MAX_ANSWER_CHARS  # noqa: E402
from app.evals.sets import SETS            # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
COLORS = {"bonsai": "#2a78d6", "qwen": "#eb6834"}    # validated categorical slots 1-2 (dataviz palette)
INK, MUTED, SURFACE = "#0b0b0b", "#52514e", "#fcfcfb"


def answers_correct(results_file: Path, questions: dict) -> tuple[int, int]:
    """(correct, total) over answerable non-trap questions, with today's forbidden words and length limit."""
    correct = total = 0
    for r in json.loads(results_file.read_text())["results"]:
        q = questions[r["id"]]
        if q.expect != "answer" or q.kind == "trap":
            continue
        total += 1
        text = re.sub(r"\[\d+\]", "", r["answer"]).lower()
        ok = (r["scores"]["correct"]
              and not any(term.lower() in text for term in q.must_not_contain)
              and len(r["answer"]) <= MAX_ANSWER_CHARS)
        correct += ok
    return correct, total


def main() -> None:
    out, stages = Path(sys.argv[1]), sys.argv[2:]
    questions = {q.id: q for q in load_golden(
        BACKEND / "evals" / "golden.jsonl", {n: {d.filename for d in ds} for n, ds in SETS.items()})}
    labels, series = [], {}
    for stage in stages:
        label, runs = stage.split("=", 1)
        labels.append(label)
        for pair in runs.split(","):
            model, file = pair.split(":", 1)
            series.setdefault(model, []).append(answers_correct(BACKEND / file, questions))

    fig, ax = plt.subplots(figsize=(7, 4), dpi=150, facecolor=SURFACE)
    ax.set_facecolor(SURFACE)
    xs = range(len(labels))
    for model, points in series.items():
        ys = [c for c, _ in points]
        ax.plot(xs, ys, color=COLORS[model], linewidth=2, marker="o", markersize=8,
                markeredgecolor=SURFACE, markeredgewidth=2, zorder=3)
        for x, (c, t) in zip(xs, points):
            ax.annotate(f"{c}/{t}", (x, c), textcoords="offset points", xytext=(0, 10),
                        ha="center", fontsize=9, color=INK)
        ax.annotate(model, (xs[-1], ys[-1]), textcoords="offset points", xytext=(14, -3),
                    fontsize=10, color=INK, fontweight="bold")
    ax.set_xticks(list(xs), labels, color=MUTED, fontsize=9)
    total = series[next(iter(series))][0][1]
    ax.set_ylim(total - 10, total + 1)
    ax.set_ylabel(f"answers correct (of {total})", color=MUTED, fontsize=9)
    ax.set_title("Answerable questions correct, per experiment stage", color=INK, fontsize=11, loc="left")
    ax.text(0, -0.2, f"y-axis starts at {total - 10}. All runs re-scored with the final checks.",
            transform=ax.transAxes, fontsize=8, color=MUTED)
    ax.grid(axis="y", color="#e6e5e0", linewidth=0.8)
    ax.tick_params(axis="y", colors=MUTED, labelsize=8, length=0)
    ax.tick_params(axis="x", length=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color("#d0cfca")
    ax.set_xlim(-0.3, len(labels) - 1 + 0.6)
    fig.tight_layout()
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, facecolor=SURFACE)
    print(f"saved {out}")
    for model, points in series.items():
        print(model, " → ".join(f"{label} {c}/{t}" for label, (c, t) in zip(labels, points)))


if __name__ == "__main__":
    main()
