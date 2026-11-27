# Evidence Reader: built, checked on the real stack

Date: 2026-11-23 · Branch: `feat/evidence-reader` · Phase 3, last item ("the Reader decision")
Design: `docs/superpowers/specs/2026-11-23-evidence-reader-design.md` · Plan: `docs/superpowers/plans/2026-11-23-evidence-reader.md`

## TL;DR

- A student can now check an answer against the real page: the source card marks the sentence that supports
  each claim, and "Open page 8" opens the real PDF at that page with the same sentences marked on it.
- In-app Reader with PDF.js (option B, chosen over a new browser tab and over page images): works the same on
  every device and is the base for later highlights, pen and notes.
- Checked on the real stack (FastAPI + Supabase + Ollama, test user A, cleaned afterwards), at 14 sizes in light
  and dark, keyboard only, and as a production build under its Content Security Policy.
- 182 backend and 255 frontend tests; lint, type check and build clean. Design critique 30/40 (whole app before: 29/40).

## What was built (9 tasks, each test-first)

| Task | What |
|---|---|
| 1 | `GET /documents/{id}/file`: owner check, 10-minute signed link, same 404 for missing and not-yours |
| 2 | supporting-sentence finder (`shared/evidence.ts`): sentence split (abbreviations, decimals), lexical score with numbers and units counted double, mark only a clear winner (>= 0.5 and 0.15 ahead) |
| 3 | source cards: yellow marks, excerpt starts at the first mark, "Show whole passage", "Open page N"; clicking the 2nd `[1]` scrolls to that claim's mark |
| 4 | Library file names open the Reader |
| 5 | Reader route, full window with a remembered sidebar toggle, link loading and states (404, offline, expired link renewed once, damaged PDF); Reader code loaded only when needed |
| 6 | PDF.js 6.5.438: whole document, opens at the page, only the visible page ±1 drawn, selectable text layer, keys, zoom |
| 7 | marks on the real page: compare letters and digits only, map back to the text pieces; next page if needed; multiply blending + green underline |
| 8 | Source / Chat panel: docked >= 1000px, slide-over dialog 600-999px, nothing on phones |
| 9 | real-stack run, sizes, keyboard, production CSP, fixes below, critique |

## Real stack (test user A, ethics.pdf 21 pages 1.8 MB, a real qwen answer)

| Step | Result |
|---|---|
| upload → Ready | ✓ |
| "What is strict liability?" | answer in 19.2 s, cites p. 8; the card marks "One kind of legal responsibility is strict liability: …" |
| "Open page 8" | Reader at 8 / 21 in 5.1 s, 7 marked text pieces on the page, the claim in the Source tab |
| Back to chat | ✓ same chat |
| Library → ethics.pdf | page 1, "Back to Library", Chat tab first |
| follow-up in the Reader's Chat tab | answered in ~6 s next to the page, newest message in view, the page did not move |
| delete the document | old citation: "Source removed", no link; old Reader link: "This document is no longer in your Library." |
| 14 sizes × light/dark | 28/28: page 8 with its marks, no sideways scroll, panel docked >= 1024, buttons 640-960, none on phones and 844×390 |
| keyboard | Enter on "Open page" → Reader with focus on the pages → PageDown 8 → 9 → Shift+Tab reaches Back and the sidebar toggle; slide-over: Enter opens, Esc closes, focus returns |
| production build | CSP present (`worker-src 'self'`), PDF.js worker runs, 0 CSP violations, marks drawn |
| loading in pieces | no: Supabase answers range requests (206) but does not announce them, so the whole file downloads at once (predicted in Task 1) |

## Found by looking (not by unit tests) and fixed

| Found | How | Fix |
|---|---|---|
| page hidden under the sticky toolbar | screenshot | scroll margin |
| phone opened at page 8, then drifted to page 9 | measured | stay on the page when the page size changes (+ test) |
| our marks dimmed the words and looked like the PDF's own highlights | screenshot of ethics.pdf (already highlighted) | multiply blending + green underline |
| docked panel invisible at 1440 | screenshot | a centring rule also caught the `<aside>`: states get their own box |
| excerpt scrolled inside the scrolling panel | screenshot | full excerpt in the Reader |
| excerpt showed a sideways scrollbar | screenshot | `overflow-x: hidden` (marks' 2px padding) |
| Reader chat did not scroll to the new answer | real follow-up | scroll to the newest message (+ test) |
| zoom buttons covered the panel's question box | screenshot | zoom sticks to the page column |
| first Tab skipped the toolbar | keyboard run | focus goes to the pages when the Reader opens (+ test) |

Lesson: the plan's tests proved each part; only the real stack and real PDFs (one already full of highlights)
showed how the parts look and behave together.

## Findings for other phases

- Pressing Enter right after the chat page opens can be ignored while the workspace loads (the text stays). MVP behaviour; backlog.
- Range loading would need a storage proxy or a CDN that announces `Accept-Ranges`; with the 20 MB cap the full download is acceptable for now.
- The backend should refuse a second reading of a document that is being read (lock); today only the frontend prevents it.

## Design critique

`/impeccable critique` of the Reader and the source cards (design review + detector in parallel), snapshot
`.impeccable/critique/2026-11-23T10-36-32Z__frontend-src-features-reader.md`: **30/40 Good** (whole app before: 29/40).
Flexibility 2 -> 3. Not AI-looking; detector: 0 code findings, 1 defensible browser hit (zoom control border + shadow),
the rest false positives (mostly the invisible PDF.js text layer).

| | Issue |
|---|---|
| P1 | our marks lose to a PDF's own highlights (pre-highlighted lecture PDFs); the green underline is the only "ours" signal and is not explained |
| P1 | phones: fit-width text ~6px, no zoom below 1000px, no claim next to the page |
| P2 | slide-over without a focus trap; arrow keys switch tabs without moving focus; the page counter announces every page while scrolling |
| P2 | "Show whole passage" / "Open page" are 32px high on phones (44px rule) |
| P3 | "Back to chat" twice; the Source tab doesn't show the question; "Open page 8" while on page 8 |

Fixed in this branch (owner's choice, test-first): both P2s and the P3 (dialog focus trap, tab focus, announcements
only on jumps + "2 sentences marked", 44px actions on phones, question in the Source tab, no duplicates).
Next, in their own small design round: the two P1s (marks on pre-highlighted PDFs, the phone Reader).

## Final review (2026-11-27)

A fresh reviewer read the whole branch (11 commits): **with fixes**, 0 critical, 5 important. All important ones
fixed test-first (279 frontend tests), then checked on the real stack with two generated PDFs (test user A, cleaned).

| Found | Effect for a student | Fix |
|---|---|---|
| PDF.js 6 decodes JBIG2 / JPEG 2000 pictures with WebAssembly files we never served | scanned pages draw blank | `frontend/pdfAssets.ts`: a Vite plugin serves `wasm/`, `cmaps/`, `standard_fonts/`, `iccs/` at `/pdfjs/` (fixed list, no PDF scripting engine); `openPdf` passes the URLs. Browser: the JPX test page is white without them (PDF.js: "Ensure that the `wasmUrl` API parameter is provided"), blue/green/red with them |
| PageUp on page 1 (End on the last page) set a "jump" that was never cleared | scrolling no longer drew pages or moved the counter | already on that page: just scroll to it |
| Reader state (damaged, failed, renewed) kept across documents | one damaged PDF made the next one "can't be shown" | reset when the document changes (the panel stays open) |
| a deleted / not-yours `?chat=` | every question in the Chat tab failed | a 404 chat counts as no chat: the first question starts one |
| PDF.js network errors were classed "damaged" | offline mid-download = dead end | `loadErrorKind`: expired / broken (InvalidPDF, Password) / failed (anything else: Try again) |
| pages leaving the screen kept PDF.js resources and canvases | memory on long reads, iOS canvas limit | `page.cleanup()`, canvases emptied, cancelled work caught |
| (re-graded from minor) the Reader took focus while loading | a question being typed lost focus | focus the pages only when nothing else has focus |

Plan's 300+ page check (skipped in Task 9, done now): 340-page file, at most 3 pages drawn while scrolling 60
pages, JS heap 49 -> 63 MB and flat, End / PageUp at the edges then scrolling follows, 0 console errors
(desktop Chromium; no iPhone to measure on). Network drop simulated by blocking the download: "This PDF
couldn't be loaded." + Try again, which then draws the page.

Deferred (small): partial vs none for "Not found on this page"; a short sentence can match the first place on the
page; code point vs UTF-16 offsets; bullet answers without full stops get no marks; `/file` can return `url: null`
and has no `Cache-Control: no-store`; page-number field and page skeleton from the spec; a non-UUID Reader URL
retries instead of saying "gone"; "Back to chat" for a dead chat id.

## Reproduce

```bash
cd backend && ../.venv/bin/python -m uvicorn app.main:app --port 8000
cd frontend && npm run dev          # http://localhost:5173
npm test && npm run lint && npm run build
```
