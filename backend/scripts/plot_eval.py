"""Chart eval runs from their saved results files.

Usage (from backend/):
    # one point per experiment stage, per model (same question set at every stage)
    PYTHONPATH=. python scripts/plot_eval.py OUT.png "label=bonsai:FILE,qwen:FILE" "label=..." ...
    # one run per model, split by question kind (e.g. the held-out set)
    PYTHONPATH=. python scripts/plot_eval.py --by-kind OUT.png bonsai:FILE qwen:FILE

Every saved answer is RE-SCORED with the real scorer (score_question) and today's version of the
golden file that run used, so older and newer runs are judged by the same rules: an early run was
scored before some checks existed, and a golden-set fix (e.g. an extra acceptable page) must count
for every run. The answer, the retrieved pages and the refusal are taken from the file as they were.
"""

import json
import re
import sys
from pathlib import Path
from types import SimpleNamespace

import matplotlib

matplotlib.use("Agg")                      # draw to a file, no window
import matplotlib.pyplot as plt            # noqa: E402

from app.evals.golden import Question, load_golden   # noqa: E402
from app.evals.scoring import score_question         # noqa: E402
from app.evals.sets import SETS                      # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
COLORS = {"bonsai": "#2a78d6", "qwen": "#eb6834"}    # validated categorical slots 1-2 (dataviz palette)
INK, MUTED, SURFACE, GRID = "#0b0b0b", "#52514e", "#fcfcfb", "#e6e5e0"
_MARKER = re.compile(r"\[(\d+)\]")


def rescored(results_file: Path) -> list[tuple[Question, bool]]:
    """[(question, correct)] for every result in the file, re-scored with today's golden file."""
    data = json.loads(results_file.read_text())
    golden = BACKEND / "evals" / data["settings"].get("golden", "golden.jsonl")
    questions = {q.id: q for q in load_golden(golden, {n: {d.filename for d in ds} for n, ds in SETS.items()})}
    out = []
    for r in data["results"]:
        q = questions[r["id"]]
        # The scorer only reads .filename/.page of a hit and .text/.cited/.refused of an answer,
        # so lightweight stand-ins rebuilt from the file are enough (no database, no model).
        hits = [SimpleNamespace(filename=f, page=p) for f, p, _ in r["retrieved"]]
        cited = [n for n in dict.fromkeys(int(x) for x in _MARKER.findall(r["answer"])) if 1 <= n <= len(hits)]
        parsed = SimpleNamespace(text=r["answer"], cited=cited, refused=r["scores"]["refused"])
        correct = bool(r["scores"]["correct"]) if "model_error" in r["scores"]["failed"] \
            else score_question(q, hits, parsed).correct
        out.append((q, correct))
    return out


def answers_correct(results_file: Path) -> tuple[int, int]:
    """(correct, total) over answerable non-trap questions, the same group as the summary's 'answers'."""
    rows = [ok for q, ok in rescored(results_file) if q.expect == "answer" and q.kind != "trap"]
    return sum(rows), len(rows)


def _style(ax) -> None:
    ax.set_facecolor(SURFACE)
    ax.tick_params(length=0, colors=MUTED, labelsize=8)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color("#d0cfca")


def stages_chart(out: Path, stages: list[str]) -> None:
    labels, series = [], {}
    for stage in stages:
        label, runs = stage.split("=", 1)
        labels.append(label)
        for pair in runs.split(","):
            model, file = pair.split(":", 1)
            series.setdefault(model, []).append(answers_correct(BACKEND / file))

    fig, ax = plt.subplots(figsize=(7, 4), dpi=150, facecolor=SURFACE)
    _style(ax)
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
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_xlim(-0.3, len(labels) - 1 + 0.6)
    _save(fig, out)
    for model, points in series.items():
        print(model, " → ".join(f"{label} {c}/{t}" for label, (c, t) in zip(labels, points)))


def by_kind_chart(out: Path, runs: list[str]) -> None:
    """Dot plot: one row per question kind, one dot per model, x = share correct."""
    series: dict[str, dict[str, tuple[int, int]]] = {}
    for pair in runs:
        model, file = pair.split(":", 1)
        counts: dict[str, list[int]] = {}
        for q, ok in rescored(BACKEND / file):
            c = counts.setdefault(q.kind or "-", [0, 0])
            c[0] += ok
            c[1] += 1
        series[model] = {k: (c, t) for k, (c, t) in counts.items()}
    kinds = list(next(iter(series.values())))
    kinds.sort(key=lambda k: sum(s[k][0] / s[k][1] for s in series.values()))   # weakest at the bottom

    fig, ax = plt.subplots(figsize=(7, 0.42 * len(kinds) + 1.3), dpi=150, facecolor=SURFACE)
    _style(ax)
    offsets = {m: (i - (len(series) - 1) / 2) * 0.22 for i, m in enumerate(series)}
    for y, kind in enumerate(kinds):
        ax.axhline(y, color=GRID, linewidth=0.8, zorder=1)
        for model, counts in series.items():
            c, t = counts[kind]
            ax.plot(c / t, y + offsets[model], "o", color=COLORS[model], markersize=8,
                    markeredgecolor=SURFACE, markeredgewidth=2, zorder=3)
            ax.annotate(f"{c}/{t}", (c / t, y + offsets[model]), textcoords="offset points",
                        xytext=(8 if c < t else -8, -3), ha="left" if c < t else "right", fontsize=7, color=INK)
    ax.set_yticks(range(len(kinds)), [k.replace("_", " ") for k in kinds], color=INK, fontsize=9)
    ax.set_xlim(-0.05, 1.12)
    ax.set_xticks([0, 0.5, 1], ["0%", "50%", "100%"])
    ax.set_ylim(-0.6, len(kinds) - 0.4)
    ax.set_title("Held-out set: share correct per question kind", color=INK, fontsize=11, loc="left")
    handles = [plt.Line2D([], [], marker="o", linestyle="", color=COLORS[m], markersize=7, label=m) for m in series]
    ax.legend(handles=handles, loc="lower right", frameon=False, fontsize=8, labelcolor=INK)
    _save(fig, out)
    for model, counts in series.items():
        print(model, " · ".join(f"{k} {c}/{t}" for k, (c, t) in counts.items()))


def _save(fig, out: Path) -> None:
    fig.tight_layout()
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, facecolor=SURFACE)
    print(f"saved {out}")


def main() -> None:
    if sys.argv[1] == "--by-kind":
        by_kind_chart(Path(sys.argv[2]), sys.argv[3:])
    else:
        stages_chart(Path(sys.argv[1]), sys.argv[2:])


if __name__ == "__main__":
    main()
