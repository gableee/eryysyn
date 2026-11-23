# Evidence Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the trust loop: mark the sentence(s) in each source that support the answer, and open the real PDF at the cited page in an in-app Reader (PDF.js) that later study tools can build on.

**Architecture:** A backend endpoint returns a 10-minute signed link to the stored PDF after an owner check. Pure functions in `src/shared/evidence.ts` find the supporting sentences (used by the chat card and the Reader). A new feature `src/features/reader` holds the Reader page and the PDF.js view, loaded with `React.lazy`; `app/` composes it with the chat feature (Source and Chat panels) so features still never import each other.

**Tech Stack:** FastAPI + Supabase Storage (`create_signed_url`); React 19 + TS + Vite, React Router (data router), TanStack Query, CSS Modules + Sage tokens, `pdfjs-dist` (pinned), Vitest + RTL; pytest against the real test stack.

**Spec:** `docs/superpowers/specs/2026-11-23-evidence-reader-design.md`

## Global Constraints

- Owner's rules: test first (watch it fail); after each task stop, show files + proposed message, ask "commit?"; the owner commits; update `docs/CONTEXT.md` after each task.
- Text stays text: excerpts, claims and PDF text are rendered as React text / `<mark>` elements, never as HTML.
- Signed link: `expires_in` 600 seconds; never stored (no DB, no localStorage); 404 for missing or not-owned (same response).
- PDF.js: `pdfjs-dist` pinned to an exact version published at least 14 days before install (check `npm view pdfjs-dist time --json`); `isEvalSupported: false`; worker served from our origin; CSP gains `worker-src 'self'`.
- PDF.js is loaded only when a Reader opens (`React.lazy`); the main bundle must not grow by more than 5 KB gzip.
- Highlight rule: best excerpt sentence only if score >= 0.5 and it beats the second best by >= 0.15; otherwise no mark.
- Layout by the Reader container: wide >= 1000px (docked 360px panel), medium 600-999px (slide-over panel), phone < 600px or height < 500px (no panel, no sidebar toggle).
- Reader opens full window; sidebar toggle remembered in localStorage key `eryysyn.readerSidebar` (`open` | `closed`, default `closed`), read and written inside try/catch.
- Reader URL: `/documents/:id?page=<n>&chat=<conversationId>&answer=<messageId>&n=<citation n>`; `page` defaults to 1 and is clamped to 1..last.
- WCAG 2.2 AA (mark contrast tested in light and dark), keyboard only, reduced motion; 320-2560px, no sideways scroll.
- Copy (exact): "Show whole passage", "Show less", "Open page {page}", "Back to chat", "Back to Library", "Opening {filename}…", "This document is no longer in your Library.", "This PDF can't be shown here.", "Marked in the excerpt only", "Open a source from a chat to see it here.", "Page {n} of {total}".

## Review Focus

1. A citation whose document was deleted (`document_id: null`) shows no "Open page" link, and `/documents/<deleted id>` shows the 404 state, not a crash. (Task 3, Task 5)
2. `?page=999`, `?page=0` and `?page=abc` open a valid page (clamped / default 1). (Task 6)
3. Excerpts with "e.g.", "Dr.", "120.5 mmHg" and "i.e." split into the right sentences. (Task 2)
4. Three claims citing [1], two supported by the same excerpt sentence: one mark for those two, every claim listed. (Task 2, Task 8)
5. A Reader URL whose `chat` id is missing, deleted or not the user's: the Source tab shows its fallback, the Chat tab a new chat, no error page. (Task 8)

---

### Task 1: Backend signed link to the stored PDF

**Files:**
- Modify: `backend/app/api/documents.py` (new endpoint next to `reindex_document`)
- Test: `backend/tests/test_document_file.py` (real stack, like `tests/test_chat.py`: reuse `client`, `auth`, `login` from `tests.test_isolation` and `make_pdf` from `tests.test_indexing`)

**Interfaces:**
- Produces: `GET /documents/{document_id}/file` → `200 {"url": str, "expires_in": 600}`; `404 {"detail": "Document not found"}`.

- [ ] **Step 1: Write the failing tests**

```python
def test_owner_gets_a_working_signed_link(doc_a):        # fixture: user A uploads make_pdf("Page one.", "Page two.")
    r = client.get(f"/documents/{doc_a}/file", headers=auth(token_a))
    assert r.status_code == 200 and r.json()["expires_in"] == 600
    pdf = httpx.get(r.json()["url"])
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

def test_link_allows_range_requests(doc_a):               # settles the spec's open question for PDF.js
    url = client.get(f"/documents/{doc_a}/file", headers=auth(token_a)).json()["url"]
    part = httpx.get(url, headers={"Range": "bytes=0-99"})
    print("range status:", part.status_code)              # record 206 or 200 in CONTEXT
    assert part.status_code in (200, 206)

def test_other_user_and_missing_id_get_404(doc_a):
    assert client.get(f"/documents/{doc_a}/file", headers=auth(token_b)).status_code == 404
    assert client.get(f"/documents/{uuid.uuid4()}/file", headers=auth(token_a)).status_code == 404
```

- [ ] **Step 2: Run** `cd backend && ../.venv/bin/python -m pytest tests/test_document_file.py -v` — Expected: FAIL (404 on the owner's request, route missing).
- [ ] **Step 3: Implement `get_document_file(document_id: uuid.UUID, user_id = Depends(get_current_user_id)) -> dict`** with the same owner query as `delete_document`, then `supabase.storage.from_(BUCKET).create_signed_url(row[0], 600)`; return its `signedURL` (or `signedUrl`, depending on the client version) as `url`.
- [ ] **Step 4: Run** the same command plus the whole suite `../.venv/bin/python -m pytest -q` — Expected: PASS; note the printed range status.
- [ ] **Step 5: Commit?** `feat(backend): owner-checked 10-minute signed link to a stored PDF`

### Task 2: Supporting sentences (shared pure functions)

**Files:**
- Create: `frontend/src/shared/evidence.ts`
- Test: `frontend/src/shared/evidence.test.ts`

**Interfaces:**
- Produces:
  - `splitSentences(text: string): string[]`
  - `findSupportingSentence(claim: string, sentences: string[]): number | null`
  - `claimsFor(answer: string, n: number): string[]` (each answer sentence carrying `[n]`, markers removed, in order; the k-th occurrence of `[n]` belongs to `claims[k]`)
  - `supportForCitation(answer: string, n: number, excerpt: string): Support` where
    `type Support = { sentences: string[]; marks: { index: number; claims: number[] }[] }` (one mark per excerpt sentence, listing the claim indexes it supports, sorted by `index`).

- [ ] **Step 1: Write the failing tests** (values from the spec)

```ts
it('keeps abbreviations and decimals inside a sentence', () => {
  expect(splitSentences('Use a cuff, e.g. an adult one. Dr. Lee read 120.5 mmHg. Then i.e. twice.'))
    .toEqual(['Use a cuff, e.g. an adult one.', 'Dr. Lee read 120.5 mmHg.', 'Then i.e. twice.'])
})
it('finds the paraphrased sentence with the numbers', () => {
  const s = splitSentences(BP_EXCERPT)   // "Blood pressure is measured in millimetres of mercury. Normal adult blood pressure is defined as a systolic pressure below 120 mmHg and a diastolic pressure below 80 mmHg. Readings vary with posture and time of day."
  expect(findSupportingSentence('Normal adult blood pressure is a systolic reading below 120 mmHg and a diastolic reading below 80 mmHg', s)).toBe(1)
})
it('returns null when no sentence clearly wins (score < 0.5 or margin < 0.15)', () => { /* unrelated claim; two near-identical sentences */ })
it('maps every [1] claim; two claims on one sentence share one mark', () => {
  const answer = 'A is true [1]. B holds [1]. A is really true [1].'
  expect(claimsFor(answer, 1)).toHaveLength(3)
  expect(supportForCitation(answer, 1, 'A is true here. B holds too.').marks)
    .toEqual([{ index: 0, claims: [0, 2] }, { index: 1, claims: [1] }])
})
it('ignores markers for other sources and marker-like text glued to words', () => { /* "items[1]" is not a claim */ })
```

- [ ] **Step 2: Run** `npx vitest run src/shared/evidence.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** in `shared/evidence.ts`. Scoring: content words = lower-cased tokens minus a small stop-word list; numbers and units (`mmhg`, `mg`, `%`, ...) weigh 2; score = weighted share of the claim's content words found in the sentence. Claims: reuse the marker rule of `parseCitations` (copy the regex and the "glued" check into `evidence.ts`, or move the shared part into `shared/` and import it from both; do not import the chat feature from `shared/`).
- [ ] **Step 4: Run** the test file, then `npx vitest run` — Expected: PASS.
- [ ] **Step 5: Commit?** `feat(frontend): find the source sentences that support each cited claim`

### Task 3: Source card marks, "Show whole passage", "Open page"

**Files:**
- Modify: `frontend/src/features/chat/SourceCard.tsx`, `SourcesPanel.tsx`, `MessageList.tsx`, `ChatPage.tsx`, `Chat.module.css`
- Create: `frontend/src/shared/readerPath.ts`
- Test: `frontend/src/features/chat/chat.ui.test.tsx`, `chat.page.test.tsx`, `frontend/src/styles/tokens.test.ts` (mark contrast)

**Interfaces:**
- Consumes: `supportForCitation`, `claimsFor` (Task 2).
- Produces:
  - `readerPath(p: { documentId: string; page?: number; chat?: string; answer?: string; n?: number }): string` in `shared/readerPath.ts`.
  - `SourceCard` props: `{ citation: Citation; active: boolean; answer?: ChatMessage; conversationId?: string; activeClaim?: number }`.
  - Marker click: `onSelect(answerId: string, n: number, k: number)` (k = occurrence of `[n]` in that answer, 0-based); the selection stores `k`; `SourcesPanel` passes `activeClaim={k}`.
  - `<mark data-claim="i j">` per supporting sentence (claim indexes, space-separated) for later tasks to query.

- [ ] **Step 1: Write the failing tests**
  - `it('marks every supporting sentence and starts the excerpt at the first')`: card with the BP excerpt → `container.querySelectorAll('mark')` length 1 with the sentence text; the sentence before it is not shown until "Show whole passage" is clicked, then shown, and the button reads "Show less".
  - `it('a card with no clear match shows the excerpt as today')`: no `mark`, no "Show whole passage".
  - `it('Open page links to the Reader with the chat context')`: link "Open page 112" has `href` `/documents/d1?page=112&chat=c1&answer=a1&n=1`.
  - `it('a removed source has no Open page link')` (Review Focus 1).
  - `it('clicking the second [1] scrolls to that claim's mark')`: mock `scrollIntoView`; click the second marker; the call is on the `mark` whose `data-claim` contains `1`.
  - tokens test: `--hl` vs `--ink` contrast >= 4.5 in light and dark.
- [ ] **Step 2: Run** `npx vitest run src/features/chat src/styles` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** The mark is a plain `<mark>` around React text. Keep the existing "scroll only when picked" rule of `SourcesPanel`. `readerPath` builds the query with `URLSearchParams`, skipping undefined values.
- [ ] **Step 4: Run** `npx vitest run` + `npm run lint` + `npx tsc -b` — Expected: PASS.
- [ ] **Step 5: Commit?** `feat(frontend): source cards mark the supporting sentences and link to the cited page`

### Task 4: Library file names open the Reader

**Files:**
- Modify: `frontend/src/features/library/DocumentRow.tsx`, `Library.module.css`
- Test: `frontend/src/features/library/library.ui.test.tsx`

**Interfaces:**
- Consumes: `readerPath` (Task 3).

- [ ] **Step 1: Write the failing test** `it('a stored document's name links to the Reader at page 1')`: row for `{ id: 'd1', filename: 'notes.pdf', status: 'indexed' }` → link "notes.pdf" with `href` `/documents/d1`; an uploading row has no link.
- [ ] **Step 2: Run** `npx vitest run src/features/library` — Expected: FAIL.
- [ ] **Step 3: Implement** the name as a `Link` (also for failed documents: a scanned PDF can still be viewed). Underline on hover/focus only.
- [ ] **Step 4: Run** the library tests and the whole suite — Expected: PASS.
- [ ] **Step 5: Commit?** `feat(frontend): open a document from the Library`

### Task 5: Reader route, full-window shell mode, link loading and states

**Files:**
- Create: `frontend/src/features/reader/api.ts`, `hooks.ts`, `ReaderPage.tsx`, `Reader.module.css`, `reader.page.test.tsx`
- Create: `frontend/src/shared/shellSidebar.ts` (context + hook the shell provides and the Reader toolbar uses)
- Create: `frontend/src/app/ReaderRoute.tsx` (composes chat + reader; lazy-loads `ReaderPage`)
- Modify: `frontend/src/app/routes.tsx` (child route `/documents/:id`, `handle: { reader: true }`), `AppShell.tsx`, `AppShell.module.css`
- Test: `frontend/src/app/shell.test.tsx`

**Interfaces:**
- Consumes: `GET /documents/{id}/file` (Task 1); `useConversation` from the chat feature (in `app/ReaderRoute.tsx` only); `supportForCitation`, `claimsFor` (Task 2).
- Produces:
  - `getFileUrl(id: string): Promise<{ url: string; expires_in: number }>`; `useFileUrl(id: string)` (query key `['file-url', id]`, `staleTime` 8 minutes, `gcTime` 9 minutes).
  - `ReaderPage` props: `{ documentId: string; filename?: string; page: number; highlights: string[]; source?: ReactNode; chat?: ReactNode; back: { to: string; label: 'Back to chat' | 'Back to Library' } }`.
  - `PdfView` props (implemented in Task 6, a stub here that renders "PDF page {page}"): `{ url: string; page: number; highlights: string[]; onPageChange(page: number, total: number): void; onExpired(): void; onBroken(): void }`.
  - `useShellSidebar(): { inReader: boolean; open: boolean; setOpen(open: boolean): void }`.

- [ ] **Step 1: Write the failing tests**
  - shell: `it('a reader route hides the sidebar, phone bars and tabs until the toggle opens the sidebar')` and `it('the sidebar choice is remembered')` (localStorage `eryysyn.readerSidebar`; a throwing localStorage still renders).
  - reader page: `it('shows the loading state with the file name')`; `it('a 404 shows "This document is no longer in your Library." and Back')` (Review Focus 1); `it('network down shows Can't reach the server and Try again')`; `it('onExpired fetches a new link once; a second expiry shows Try again')`; `it('Back goes to the chat it came from, else to the Library')`.
  - routes/bundle: `it('the reader is lazy-loaded')` (the route element is a `React.lazy` component: assert `ReaderRoute` renders a Suspense fallback before the module resolves).
- [ ] **Step 2: Run** `npx vitest run src/app src/features/reader` — Expected: FAIL.
- [ ] **Step 3: Implement.** `AppShell` reads `useMatches().some((m) => (m.handle as { reader?: boolean })?.reader)`; in reader mode `.shell` gets a `data-reader` attribute and CSS hides the sidebar (unless open), the slim top bar and the tabs. `ReaderRoute` parses `page/chat/answer/n` (Task 6 clamps), computes `highlights` (the marked sentences from `supportForCitation`) and passes the chat-feature panels built in Task 8 (until then `undefined`).
- [ ] **Step 4: Run** the suite, lint, types, and `npm run build`; compare the main chunk size with before (Global Constraints: <= +5 KB gzip).
- [ ] **Step 5: Commit?** `feat(frontend): Reader route in full-window mode with link loading and states`

### Task 6: PDF.js view: whole document, opens at the page, draws only nearby pages

**Files:**
- Modify: `frontend/package.json` (`pdfjs-dist` exact version), `frontend/csp.ts`, `frontend/src/security.test.ts`
- Create: `frontend/src/features/reader/PdfView.tsx`, `PageSlot.tsx`, `pdf.ts` (PDF.js setup: worker URL via `pdfjs-dist/build/pdf.worker.min.mjs?url`, `getDocument` options), `pageWindow.ts` + `pageWindow.test.ts`
- Test: `frontend/src/features/reader/pdfview.test.tsx` (PDF.js mocked at `./pdf`)

**Interfaces:**
- Consumes: `PdfView` props (Task 5).
- Produces: `clampPage(raw: string | null, total: number): number`; `pagesToDraw(visible: number, total: number): number[]` (visible ± 1, within 1..total); page slots `data-page={n}` with a canvas and a `.textLayer` div, plus an empty `.marksLayer` div (room for future marks, spec "Future").

- [ ] **Step 1: Write the failing tests**
  - `clampPage`: `'999'` with 340 → 340; `'0'` → 1; `'abc'` → 1; `null` → 1 (Review Focus 2).
  - `pagesToDraw(112, 340)` → `[111, 112, 113]`; `pagesToDraw(1, 1)` → `[1]`.
  - PdfView: `it('opens at the requested page and reports "Page 112 of 340"')` (live region text); `it('PageDown and PageUp move one page')`; `it('never draws more than 5 pages')` after simulated scrolling; `it('a 403/400 load error calls onExpired, a damaged file calls onBroken')`.
  - security: `buildCsp(...)` contains `worker-src 'self'`.
- [ ] **Step 2: Run** `npx vitest run src/features/reader src/security.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Install the pinned version (`npm install pdfjs-dist@<x.y.z> --save-exact`). `getDocument({ url, isEvalSupported: false, disableAutoFetch: false, rangeChunkSize: 65536 })`. One scroll column of slots sized from page 1 until each page's size is known; an `IntersectionObserver` picks the visible page; slots outside `pagesToDraw` release their canvas. Fit to width; zoom out / in / fit buttons only when the container is wide; render text with the PDF.js `TextLayer` class.
- [ ] **Step 4: Run** the suite, lint, types, build. Then on the real stack (test user A; a fake session can't produce a real signed link) upload a 300+ page PDF, open `/documents/<id>?page=112`, and note the open time and the number of drawn pages in CONTEXT. Delete the test document afterwards.
- [ ] **Step 5: Commit?** `feat(frontend): PDF.js Reader opens the whole document at the cited page`

### Task 7: Highlight the supporting sentences on the page

**Files:**
- Create: `frontend/src/features/reader/textMatch.ts`, `textMatch.test.ts`
- Modify: `frontend/src/features/reader/PageSlot.tsx`, `PdfView.tsx`, `Reader.module.css`

**Interfaces:**
- Consumes: `highlights: string[]` (Task 5), text layer items (Task 6).
- Produces: `findTextRanges(items: string[], sentence: string): { item: number; start: number; end: number }[]` (empty when not found); `PdfView` gains `onHighlightMissing(): void` (Source tab shows "Marked in the excerpt only").

- [ ] **Step 1: Write the failing tests**
  - `findTextRanges` across items split mid-word and by line breaks (`['Normal adult blood pres', 'sure is defined as a sys-', 'tolic pressure …']`) with hyphenation `sys-\ntolic` → ranges covering the sentence.
  - not on the page → `[]`; found on the next page → highlighted there (PdfView test with mocked text content for pages 112 and 113).
  - PdfView: the first match is scrolled into view; nothing found → `onHighlightMissing` called once.
- [ ] **Step 2: Run** `npx vitest run src/features/reader` — Expected: FAIL.
- [ ] **Step 3: Implement** normalisation (lower case, collapse spaces, drop soft hyphen and "-\n" joins) on the joined item text with an index map back to items; wrap matches in `<mark>` spans inside the text layer (`--hl`, text stays text).
- [ ] **Step 4: Run** the suite, lint, types — Expected: PASS.
- [ ] **Step 5: Commit?** `feat(frontend): highlight the supporting sentences on the PDF page`

### Task 8: Source and Chat panel by available space

**Files:**
- Create: `frontend/src/features/reader/ReaderPanel.tsx`, `useReaderLayout.ts`
- Create: `frontend/src/features/chat/ReaderSource.tsx`, `ReaderChat.tsx` (exported for `app/ReaderRoute.tsx`)
- Modify: `frontend/src/app/ReaderRoute.tsx`, `frontend/src/features/reader/ReaderPage.tsx`, `Reader.module.css`
- Test: `frontend/src/features/reader/reader.page.test.tsx`, `frontend/src/features/chat/chat.ui.test.tsx`

**Interfaces:**
- Consumes: `SourceCard` with marks (Task 3), `MessageList`, `Composer`, `useSend`, `useConversation` (chat feature), `readerPath`.
- Produces:
  - `useReaderLayout(ref: RefObject<HTMLElement | null>): 'wide' | 'medium' | 'phone'` (>= 1000 wide, 600-999 medium, else phone; height < 500 → phone).
  - `ReaderSource({ conversationId?: string; answerId?: string; n?: number; highlightMissing: boolean })`: claims + card + "Back to chat"; without a valid answer: "Open a source from a chat to see it here."
  - `ReaderChat({ conversationId?: string; onOpenCitation(c: Citation, answerId: string, n: number): void })`: the conversation, or a new chat when none.

- [ ] **Step 1: Write the failing tests**
  - layout: `wide` → docked panel with tabs "Source" / "Chat" and a collapse button; `medium` → closed, the toolbar's Source button opens a dialog-like slide-over, Esc closes and focus returns; `phone` → no panel, no Source/Chat buttons, no sidebar toggle.
  - `ReaderSource`: claims listed for three `[1]` sentences (Review Focus 4); `chat` id that 404s → fallback text, no crash (Review Focus 5).
  - `ReaderChat`: sending a question uses `useSend` for that conversation; clicking a citation calls `onOpenCitation`, and `ReaderRoute` navigates to `readerPath(...)` for it.
- [ ] **Step 2: Run** `npx vitest run src/features src/app` — Expected: FAIL.
- [ ] **Step 3: Implement.** The slide-over is a `<dialog>`-like panel (`role="dialog"`, `aria-modal`, focus moved in and back). Source is the default tab when `answer` is present, else Chat.
- [ ] **Step 4: Run** the suite, lint, types, build — Expected: PASS.
- [ ] **Step 5: Commit?** `feat(frontend): Source and Chat panel beside the Reader, by available space`

### Task 9: Real-stack check, critique, Phase 3 Done

**Files:**
- Create: `docs/experiments/2026-11-2x-evidence-reader.md`
- Modify: `docs/CONTEXT.md` (checklist, Phase 3 → Done, Phase 4 → In progress, progress line), `.impeccable/critique/` (new snapshot)

- [ ] **Step 1:** Real stack (backend + Supabase + Ollama, test user A, cleaned afterwards): upload a real course PDF; ask; the card marks the right sentence; "Open page" lands on the cited page with the mark; Back returns to the chat; Library name opens page 1; the Chat tab sends a follow-up next to the page; delete the document → old citation has no link, old Reader URL shows the 404 state.
- [ ] **Step 2:** 14 sizes (as in the MVP record) in light and dark: no sideways scroll, panel mode per size, phone full screen; keyboard only (toolbar, PageUp/PageDown, panel tabs, Esc); a 300+ page PDF opens at its page and stays smooth (at most 5 pages drawn).
- [ ] **Step 3:** `/impeccable critique` on the Reader and chat; compare with 29/40.
- [ ] **Step 4:** Write the record; update CONTEXT (Phase 3 Done, first sentence of the progress line true and plain).
- [ ] **Step 5: Commit?** `docs: evidence reader record, Phase 3 done`
