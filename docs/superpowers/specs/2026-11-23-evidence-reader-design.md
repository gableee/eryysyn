# Evidence Reader: design

Date: 2026-11-23 · Branch: `feat/evidence-reader` · Phase 3, last item ("the Reader decision")
Builds on: `2026-11-15-frontend-design.md` (Reader section: view-only first, opens at the right page, pages load on
demand, PowerPoint converted to PDF on upload later, marks on a separate layer) and `2026-11-21-frontend-mvp-design.md`.
Critique: `.impeccable/critique/2026-11-23T08-11-24Z__frontend-src.md` (P1 "the evidence stops short of the page").

## Why

Eryysyn's promise is "answers from your own files, with the page to check". Today the check stops halfway: a source
card shows "p. 112" as plain text and the whole extracted chunk with nothing marked. A student (e.g. a nursing student
checking a dosage or a normal range) cannot see the real page, its tables and figures, or which sentence supports the
answer. This closes the loop: the supporting sentence is marked, and the real page opens one click away.

It is also the base for later study tools (owner's goal): highlight, draw and write notes on a PDF or slides. Those are
not built here, but nothing built here may block them.

## Goals

1. **Supporting sentences in the chat.** Each source card marks the sentence(s) that support the answer and starts the
   excerpt at the first one, with "Show whole passage". When an answer cites the same source in several sentences,
   **every cited claim gets its own mark** (owner's call; 85 of 355 eval answers do this). Works on every screen size
   (this is the readable check on phones).
2. **Open the cited page.** Every source card (panel and inline) has "Open page 112". It opens the Reader at that page
   of the whole document, with the supporting sentence highlighted on the page.
3. **Reader page.** `/documents/:id` shows the whole PDF, opening at the requested page; only pages near the screen are
   drawn, so a 340-page file opens fast and does not freeze.
4. **Library opens documents.** A file name in the Library opens the Reader at page 1.
5. **Side panel on roomy screens** with tabs **Source | Chat**: Source shows the claim and the highlighted excerpt;
   Chat continues the conversation the student came from, next to the page.
6. **Backend:** a short-lived, owner-checked link to the stored PDF.

## Non-goals (later)

- Highlights, pen, typed notes, bookmarks, the Notes tab, flashcards (later phases; see "Future" for what we keep open).
- PowerPoint (converted to PDF on upload, later; the Reader then works unchanged).
- Search inside the PDF, outline/thumbnail panel, printing, downloading.
- Asking about one document only (the backend has no per-document search yet). The Chat tab is a normal chat.
- The backend lock against reading one document twice (separate backlog item).

## Anti-goals (failure even if it "works")

- **Marking the wrong sentence.** If no sentence clearly wins, mark nothing. A wrong highlight is worse than none.
- **Making the app slower for everyone.** PDF.js must load only when a Reader opens (route code-splitting).
- **A link that leaks.** Another user's file must never be reachable; links expire; links are never stored.
- **Changing the original file.** The Reader only reads.
- **A cramped page.** On small screens the page gets the whole screen; panels never squeeze it below a readable width.

## Constraints

- Stack as is: React 19 + TS + Vite, React Router, TanStack Query, CSS Modules + Sage tokens, Vitest + RTL; FastAPI +
  Supabase (PDFs in the private Storage bucket `documents`, path in `documents.storage_path`; chunks have `page`).
- Uploads are PDF only, max 20 MB.
- WCAG 2.2 AA, keyboard only, light and dark, reduced motion; 320px to 2560px, no sideways scroll.
- Build-time CSP (`frontend/csp.ts`): the PDF.js worker must be allowed (`worker-src 'self'`); the signed link's host
  is the Supabase origin, already in `connect-src`.
- Every library version pinned exactly and at least two weeks old.
- Owner's rules: test first; "commit?" after each task; CONTEXT updated after each step.

## Approaches considered

**How to show the page**

| | A. New tab, browser's PDF viewer (`url#page=112`) | **B. Reader in the app (PDF.js)**, chosen | C. Page image drawn by the backend |
|---|---|---|---|
| Phones | iPhone Safari often ignores `#page`; Android may download | same everywhere | same everywhere |
| Highlight on the page | no | yes (text layer) | yes (box drawn on the image) |
| Base for notes/highlights/pen | no | **yes** | no |
| Cost | ~half a day | ~2-3 days, ~300 KB loaded on demand | ~1 day + server CPU per page view |

Owner chose **B**: works everywhere, scales (pages are drawn in the student's browser, no server work per view), and
is the base for the future study tools. A's signed-link endpoint and the chat highlight are reused by B.

**Where the Reader opens (wide screens)**: own page (chosen) vs beside the chat (page squeezed to ~600px, no room for
future tools). **The app sidebar in the Reader**: keep it always (Recent chats one click away, but a 1280px laptop
leaves the Reader ~1030px) vs whole window (most room, navigation only via Back). Owner chose **whole window by
default with a collapsible sidebar**: the Reader opens full width and the student can open the sidebar when they want. **Chat next to the page**: right-panel tabs (chosen) vs a floating chat bubble (covers the page being
checked, reads like a support widget, no room for Notes). **Phones**: minimal full-screen page + Back (owner's call;
the readable check is the highlighted excerpt in the chat card).

## Design

### Flow

```
chat source card ── "Open page 112" ──▶ /documents/:id?page=112&chat=<conversationId>&answer=<messageId>&n=1
library file name ─────────────────────▶ /documents/:id            (page 1, no chat)
Reader ── GET /documents/{id}/file ──▶ backend: owner check ── Supabase Storage signed URL (10 min) ──▶ { url }
Reader ── PDF.js getDocument(url) ──▶ page 112 first (range requests if Storage allows), the rest in the background
```

### Backend: `GET /documents/{id}/file`

- Same owner check as the other document endpoints (join `workspaces`, `owner_id = user`); 404 for missing or not yours
  (no difference, no enumeration).
- Returns `{ "url": <signed url>, "expires_in": 600 }` from `supabase.storage.from_(BUCKET).create_signed_url(path, 600)`.
- 10 minutes, not 5: PDF.js keeps fetching parts of the file while you read; the whole file is fetched in the background
  within seconds, well inside 10 minutes. If a fetch still fails as expired, the Reader asks for a new link once and
  reopens at the current page.
- The link is never stored (not in the database, not in localStorage); TanStack Query keeps it in memory with a
  `staleTime` shorter than the expiry.
- Tests: owner gets a link; another user and a missing id get 404; the storage call gets the right path and expiry.

### The supporting sentences (shared, pure functions)

`findSupportingSentence(answerSentence, excerpt) -> number | null` (index of the best excerpt sentence) and
`supportForCitation(answer, n, excerpt) -> { sentences, marks: { claim, claimIndex, index }[] }`, which runs the first
for **every answer sentence that carries `[n]`** (from the existing citation parsing) and drops duplicates (two claims
supported by the same excerpt sentence share one mark).

- `answerSentence`: one sentence of the answer that carries marker `[n]`.
- Split the excerpt into sentences (keep abbreviations like "e.g." and numbers like "120.5" intact).
- Score each sentence by the share of the answer sentence's content words (lower case, punctuation removed, common
  words dropped) that it contains; numbers and units count double (they carry the facts students check).
- Return the best sentence only if its score >= 0.5 and it beats the second best by >= 0.15; otherwise `null`.
- Unit-tested with real cases from the eval set (paraphrase, numbers, two similar sentences, no match).

Used in the chat card (Goal 1) and in the Reader (on-page highlight and Source tab).

### Chat source card (Goal 1 and 2)

- Excerpt starts at the first supporting sentence; every supporting sentence is marked with `--hl` (`<mark>`;
  contrast checked in light and dark). "Show whole passage" shows the full chunk with the marks kept. No match: the
  excerpt as today.
- Clicking a marker in the answer scrolls the card to **that marker's own** mark (the k-th `[n]` in the answer maps to
  its claim); the other marks stay visible.
- "Open page 112" (a link, not a button) under the excerpt, in both the docked panel and the inline sources. A removed
  document (`document_id: null`) shows no link.
- Text stays text: the mark wraps plain text; model and document text are never rendered as HTML.

### Reader page `/documents/:id`

Query: `page` (default 1, clamped to 1..last), and when opened from a citation `chat`, `answer`, `n` (the claims are
derived from the answer, so no sentence index is needed in the URL).
Loaded with `React.lazy` so PDF.js (pinned `pdfjs-dist`, worker served from our own origin via Vite) is downloaded
only when a Reader opens. PDF.js options: `isEvalSupported: false` (blocks the font-eval exploit class), range loading
on, background fetch on.

**Pages.** One scroll column of page slots, sized from the first page until each page's real size is known. Only the
slots near the screen (about the visible page plus one on each side) are drawn as canvas + text layer; far pages are
released, so memory stays flat on a 340-page file. The requested page is scrolled into view first. Fit to width by
default; zoom out / in / fit on wide screens; on touch screens the browser's pinch zoom.

**Highlight on the page.** On the cited page's text layer, find each supporting sentence (normalise spaces, line breaks
and hyphenation; if not found on that page, try the next page, because a chunk can cross a page end). Mark the matching
text spans with `--hl` and scroll the first one into view. Not found: no page highlight, and the Source tab says "Marked in the
excerpt only".

**Text layer**: real, selectable text over the page (screen readers, copy). The page counter is a live region
("Page 112 of 340"). Keys: PageDown/PageUp and arrows move pages; Home/End; the page number field jumps.

**Toolbar**: sidebar toggle (600px and up), Back (to the chat or Library it came from), file name (truncated), page
"112 / 340" with a number field, zoom (wide only), Source and Chat toggles (medium only).

**App sidebar in the Reader** (owner's call): the Reader opens **full window** (the app's sidebar, icon rail and phone
bars hidden). The sidebar toggle opens the sidebar (docked, pushing the page; the icon rail at 600-959px) and closes it
again. The choice is remembered on this device (a per-device convenience in localStorage, read safely; default:
closed). Builder: the Reader is a child route of the app shell, which reads a route flag (e.g. a route `handle`) to
switch into this mode.

### Layout by available space (measured on the Reader's container, like the chat)

| Space | Example | Panel |
|---|---|---|
| wide >= 1000px | laptop, desktop (1280px with the sidebar open still leaves ~1030px) | docked on the right (360px), tabs Source / Chat, collapsible (») to give the page the full width |
| medium 600-999px | tablet portrait, small laptop, split screen | closed by default; Source or Chat in the toolbar slides it over the page from the right; Esc or × closes; focus moves into it and back |
| phone < 600px, or short (height < 500px) | phone, landscape phone | no panel, no sidebar toggle: full-screen page, toolbar with Back and the page counter only |

**Source tab** (default when opened from a citation): the claim(s) (each answer sentence citing this source), the
excerpt with the sentences marked (same component as the chat card), "Back to chat". Opened from the Library: "Open a source from a chat to see
it here."

**Chat tab**: the conversation from `chat` (reusing MessageList, Composer and the send logic); a citation clicked there
moves the Reader to that document and page (same route, new params). Opened from the Library: a new chat (all
documents; per-document search is a non-goal).

### States

- Loading: page-shaped skeleton + "Opening Vital Signs, ch. 12.pdf…" with progress when the download size is known.
- Not found / not yours (404): "This document is no longer in your Library." + Back.
- Link expired mid-read: one silent retry with a new link; a second failure shows Try again.
- PDF cannot be drawn (damaged file): "This PDF can't be shown here." + Back.
- Network down: the existing "Can't reach the server" + Try again.

## Security

Owner check on the link endpoint; 10-minute signed links; links never stored; PDF.js pinned and current, eval off;
worker from our origin only (`worker-src 'self'`); text layer and excerpts rendered as text; no new token handling
(the PDF request carries no Eryysyn token; the signed link is the only key). CSP test extended for the worker.

## Testing and checks

- Backend: endpoint tests (owner, other user, missing, expiry passed to storage).
- Frontend unit: `findSupportingSentence` (real eval cases); source card (mark, "Show whole passage", link present /
  absent for removed documents); Reader with PDF.js mocked at the module boundary (opens at page, clamps page, panel
  per size, 404 state, retry on expiry, Back target); CSP includes the worker.
- Browser: the 14 sizes (no sideways scroll; page readable width; panel modes), keyboard only, light and dark.
- Real stack: a real course PDF; "Open page" from a citation lands on the right page with the sentence marked;
  a 300+ page PDF opens at its page in about 2 seconds locally and stays smooth while scrolling (at most ~5 pages drawn).
- Critique after, compared with 29/40.

## Future (kept open, not built)

- Marks (highlights, pen strokes, note pins) stored on a separate table, positioned **relative to the page** in PDF
  points (page number + coordinates or text offsets), drawn on an extra layer above the text layer. The page slot
  structure (canvas, text layer, room for a marks layer) is built so this is an addition, not a rewrite.
- Notes tab next to Source and Chat. PowerPoint converted to PDF on upload, citations saying "Slide 14".

## Left to the builder

Exact `pdfjs-dist` version (>= 2 weeks old); the sentence splitter details; zoom steps; how many pages around the
screen are drawn; URL parameter names; whether Supabase Storage honours range requests through signed links (check
first: if not, the whole file downloads, max 20 MB, with progress, and everything else stands).

## Done means

All goals work on the real stack, the checks above pass, the critique is re-run, and CONTEXT marks Phase 3 Done.
