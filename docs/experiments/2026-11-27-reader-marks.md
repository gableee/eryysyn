# Reader marks and phone reading: built, checked on the real stack

Date: 2026-11-27/28 · Branch: `feat/reader-marks` · Phase 4 (Reader critique P1s)
Design: `docs/superpowers/specs/2026-11-27-reader-marks-design.md` · Plan: `docs/superpowers/plans/2026-11-27-reader-marks.md`

## TL;DR

- Evidence marks on the PDF page are now a **green margin bar with the citation number + a 3px underline, no fill**:
  they stay recognisable on lecture PDFs the author already highlighted (ours never mixes with their colours).
- On a phone the page opens **fitted to its text column**, a **reading strip** shows the marked sentence at reading
  size ("For [1] · p. 8 · 1 of 2 ›"), and **two-finger zoom** works on the page (sharp after lifting).
- Built subagent-driven: 6 tasks, each built by a fresh agent and reviewed by another; then one whole-branch review
  and one fix wave. 357 frontend tests (was 287), 186 backend; lint, type check, build clean.
- The real-browser check found the one bug no test could see (phone citations scrolled 42px sideways); fixed and
  re-measured.

## Before building: measured the matching (2026-11-27)

138 saved eval answers, excerpts rebuilt exactly, the app's own `evidence.ts`: qwen 85% of claims marked, 12/12
sampled marks right, 0 marks under 6 words, bullet answers 2 of 81. Decision: keep the matching, fix how marks
look and read.

## What was built

| Task | What | Review |
|---|---|---|
| 1 | margin bar + number + 3px underline, no fill (`marginBars.ts`, `PageSlot`) | clean |
| 2 | the PDF view reports which sentences it marked and on which page (`onMarks`, `showSentence`) | 1 fix: an all-found citation said "Not all of these are marked" |
| 3 | phones open fitted to the text column (`textColumn.ts`) | 1 fix round: a redraw right after opening (two width measures), the column's right edge clipped (padding ignored) |
| 4 | two-finger zoom, anchored under the fingers, canvases capped at 16,777,216 px (`pinch.ts`, `canvasDensity.ts`) | 1 fix: a pinch while loading made the Reader open at page 1 |
| 5 | phone reading strip (`ReadingStrip.tsx`), citation number wired | clean (9 small findings, 3 fixed later) |
| 6 | the chat card mark gets the same underline; the Source tab explains the mark | clean |
| final | whole-branch review (11 commits) + one fix wave | see below |

## Real stack (test user A, ethics.pdf already full of author highlights, a real qwen answer: [1] on p. 8, 29.7 s)

| Check | Result |
|---|---|
| desktop 1440×900 | no fill; 3px #2F6F4F underline visible over the author's blue; 2 bars with "1", `aria-hidden`; explaining line in the Source tab; card underline |
| phone 390×844, touch, 3× density | strip "For [1] · p. 8 · 1 of 2"; › goes to "2 of 2" and the page scrolls to that mark; a tap hides / shows the strip |
| pinch (fingers 90 → 190 px apart) | page 439 → 928 px (×2.1); toolbar and strip did not move |
| maximum zoom | page 1759 px (×4, the limit); largest canvas 16,772,400 px (cap 16,777,216) |
| Library open on the phone | no strip; text 12 … 377 px (column fit right) |
| dark theme | page bar stays green on the white page; card underline uses the themed green |
| console | 0 errors |

## Found by looking (not by tests) and fixed

| Found | Cause | Fix | After |
|---|---|---|---|
| a phone citation opened scrolled 42px sideways: the start of every line and the margin bar off screen | `.pageMark { scroll-margin: 96px }` on all four sides; once the page could scroll sideways, "bring the mark into view" also scrolled left/right | scroll margin top/bottom only; the mark scrolls say `inline: 'nearest'`; a CSS guard test | scrollLeft 81 → 28; text from 22 px; bar at 12, number circle at 6 px |
| the number circle half off screen | text column started 12 px from the edge, the bar 10 px left of it | left gap 22 px | circle fully visible |
| hiding / showing the strip went back to "1 of 2" | hiding unmounted the strip | stays mounted, hidden | "2 of 2" survives |

Also fixed in the wave (test-first): a tap while the PDF loads no longer hides the strip before it appears; focus moves
to the other arrow when › reaches the last sentence; the explaining line is hidden when the page has no mark.

## Deferred (small, with reasons in the ledger)

Storage errors on `/file` are not logged yet; a one-line sentence that starts mid-line gets its bar over the previous
words; the strip can cover the end of the last page (a tap hides it); the text column is measured on the opening page
only; two adjacent sentences give two joined bars with two "1"s; the strip stays hidden if another citation opens in
the same Reader. Not measured: an iPhone (none here), screen readers on a phone.

## Lessons

- The tests proved each piece; only a real phone-size browser showed that two correct pieces (a scroll margin from
  last week, sideways scrolling from this week) combine into a bug.
- Fresh reviewers per task caught 4 real bugs before they could pile up; the whole-branch review caught the strip
  state bugs that only show when the tasks are used together.

## Reproduce

```bash
cd backend && OLLAMA_MODEL=qwen3.5:9b ../.venv/bin/python -m uvicorn app.main:app --port 8000
cd frontend && npm run dev     # phone: devtools 390x844 with touch
npx vitest run --maxWorkers=2 && npm run lint && npx tsc -b
```
