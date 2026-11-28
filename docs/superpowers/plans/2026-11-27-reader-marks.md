# Reader marks and phone reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evidence marks that read as "Ery's" on any PDF (margin bar + number + thick underline, no fill), a phone Reader where the marked sentence is readable in a strip, and our own sharp two-finger zoom.

**Architecture:** All in `frontend/src/features/reader/` plus small edits in `chat/` and `app/ReaderRoute.tsx`. Geometry and maths live in small pure modules with unit tests (`marginBars.ts`, `textColumn.ts`, `pinch.ts`, `canvasDensity.ts`); components only wire DOM events to them. PdfView reports which sentences were found on which page; ReaderPage owns the phone strip and passes the citation number down.

**Tech Stack:** React 19 + TypeScript, pdfjs-dist 6.5.438 (`TextLayer`, `getTextContent`), CSS Modules, pointer events, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-27-reader-marks-design.md` (including "Calls made after the builder check").

## Global Constraints

- Page marks: **no fill**, underline `3px #2F6F4F` (fixed colour, pages are white in both themes); margin bar 4px `#2F6F4F` with the citation number in a green circle; bar and number `aria-hidden`.
- Card marks (`SourceCard` `.evidence`): keep `var(--hl)` tint, add `3px` underline in `var(--accent)`.
- Phone = `useReaderLayout(...) === 'phone'` (under 600px wide or under 500px tall). Strip only there.
- Exact copy:
  - strip header: `For [N]`; page label `p. 8`; counter `1 of 2`; buttons `aria-label` `Previous marked sentence` / `Next marked sentence`
  - no supporting sentence: `No single sentence is marked for [N]: the chat card has the whole passage.`
  - none found on the page or the next: `Not found on this page: the sentence is marked in the chat card.`
  - explaining line (Source tab, docked and slide-over): `Green bar and underline: the sentence Ery used for [N].`
- Canvas area cap: `16_777_216` pixels per canvas (iOS Safari limit).
- No new runtime dependency. `features/reader/` never imports `chat/` or `library/`.
- Keep: keyboard (PageUp/PageDown/←/→/Home/End), focus rules, announcements only on jumps and mark counts, ≥44px touch targets on phones, instant scroll under `prefers-reduced-motion` (default `scrollIntoView` is instant; never pass `behavior: 'smooth'`).
- Tests: `cd frontend && npx vitest run --maxWorkers=2` (more workers get OOM-killed); also `npm run lint`, `npx tsc -b`.

## Review Focus

1. A pinch that starts on the toolbar or the reading strip must not zoom the page (only the pages area listens). → Task 4 test.
2. Very high zoom on a high-density phone must not make a canvas over 16,777,216 pixels. → Task 4 test.
3. A citation whose sentence is found only on the next page: the strip offers it with `p. 9`, and › scrolls there. → Task 5 test.
4. A phone citation with no supporting sentence: the strip says the "No single sentence…" line, not "marked in the chat card". → Task 5 test.
5. Rotating the phone or zooming keeps the student's place (the point under the fingers stays; a width change keeps the page). → Task 4 test (anchor maths) + existing width test stays green.

---

### Task 1: Marks drawn as margin bar + number + underline

**Files:**
- Create: `frontend/src/features/reader/marginBars.ts`, `frontend/src/features/reader/marginBars.test.ts`
- Modify: `frontend/src/features/reader/PageSlot.tsx` (props, `markRanges`, draw bars), `frontend/src/features/reader/PdfView.tsx` (prop `label`, pass to slots), `frontend/src/features/reader/Reader.module.css` (`.pageMark`, `.textLayer` blend, new `.marginBar`, `.marginNum`)
- Test: `frontend/src/features/reader/pdfview.test.tsx`

**Interfaces:**
- Produces: `type MarkRect = { top: number; bottom: number; left: number }`; `type Bar = { top: number; height: number; left: number }`; `barFor(rects: MarkRect[], gap?: number): Bar | null` (gap default 10; left = min left − gap, never below 2; null for no rects).
- Produces: PageSlot prop `highlights: { index: number; text: string }[]` (index = position in PdfView's `highlights`); `onMarked(n: number, found: { index: number; found: boolean }[], first: HTMLElement | null)`; every `<mark>` gets `data-sentence={index}`.
- Produces: `PdfViewProps.label?: number` (the citation number shown in the bar's circle).

- [ ] **Step 1: Write the failing tests**
  - `marginBars.test.ts`:
    - `it('one bar from the first line to the last, just left of the text')`: `barFor([{top:100,bottom:118,left:72},{top:120,bottom:138,left:60}])` → `{ top: 100, height: 38, left: 50 }`.
    - `it('never leaves the page on the left')`: `barFor([{top:0,bottom:10,left:4}])!.left` → `2`.
    - `it('no rectangles: no bar')`: `barFor([])` → `null`.
  - `pdfview.test.tsx`:
    - `it('page marks carry their sentence index, and each found sentence gets a bar with the citation number')`: `view(112, { highlights: [sentence], label: 1 })` with page 112 text split in two pieces (reuse the existing "pres|sure" fixture); expect `container.querySelectorAll('[data-page="112"] mark[data-sentence="0"]')` length 2, and `[data-page="112"] [data-bar]` length 1 with text `1` and `aria-hidden="true"`.
    - `it('a page without highlights has no bars')`: same doc, `highlights: []` → no `[data-bar]`.
- [ ] **Step 2: Run** `npx vitest run src/features/reader --maxWorkers=2`. Expected: the new tests FAIL (`barFor` missing; no `data-sentence`, no `[data-bar]`).
- [ ] **Step 3: Implement.**
  - `barFor` in `marginBars.ts`.
  - `PageSlot`: `markRanges(divs, perSentence: { index: number; ranges: TextRange[] }[]): Map<number, HTMLElement[]>` (marks per sentence index, each with `data-sentence`). After marking, for each sentence with marks: rects from `getBoundingClientRect()` minus the slot's own rect, `barFor`, then append to the slot's `marksLayer` one `div[data-bar]` (class `marginBar`, `aria-hidden="true"`, positioned with `top/height/left` px) holding a `span` (class `marginNum`) with `label` (no number when `label` is undefined). Clear `marksLayer` in the effect cleanup, next to `textDiv.replaceChildren()`. Bars are rebuilt on every draw, so zoom keeps them aligned.
  - `PdfView`: `highlights` stays `string[]`; it passes `highlights.map((text, index) => ({ index, text }))` to the cited page and the spill sentences with their original indices to the next page (`spill.sentences` becomes `{ index, text }[]`). Pass `label` to every slot.
  - CSS: `.pageMark { background: none; color: transparent; text-decoration: underline 3px #2F6F4F; text-underline-offset: 2px; text-decoration-skip-ink: none; scroll-margin: 96px }`; drop `mix-blend-mode: multiply` from the text layer (nothing to blend now); `.marginBar` (absolute, width 4px, `#2F6F4F`, radius 2px) and `.marginNum` (16px circle, `#2F6F4F`, white bold 10px, centred on the bar's top).
- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 && npm run lint && npx tsc -b`. Expected: all PASS (existing mark tests still pass: marks are still `<mark>` with the same text).
- [ ] **Step 5: Commit?** `feat(frontend): evidence marks as a margin bar with the citation number and a thick underline, no fill`

### Task 2: PdfView reports which sentences were found, and on which page

**Files:**
- Modify: `frontend/src/features/reader/PdfView.tsx`, `frontend/src/features/reader/ReaderPage.tsx`
- Test: `frontend/src/features/reader/pdfview.test.tsx`, `frontend/src/features/reader/reader.page.test.tsx`

**Interfaces:**
- Consumes: Task 1's `onMarked(n, found: { index; found }[], first)`.
- Produces: `PdfViewProps.onMarks?(found: { index: number; page: number }[], total: number): void`, called **once per highlights set**, after the cited page (and the next page when needed) are done; `found` sorted by page, then index. Replaces `onHighlightMissing` (removed).
- Produces: `type PdfViewHandle = { showSentence(index: number): void }` via the `ref` prop (React 19 ref-as-prop, `useImperativeHandle`): scrolls `mark[data-sentence="index"]` (first one) into view with `{ block: 'center' }`; if that page is not drawn yet, first jumps to its page (the same path as a key press), then scrolls when the mark appears.
- ReaderPage keeps `missingOnPage` (`'all' | 'some' | null`), now derived from `onMarks`: 0 found → `'all'`, fewer than total → `'some'`.

- [ ] **Step 1: Write the failing tests** (rewrite the three `onHighlightMissing` tests in `pdfview.test.tsx` to the new callback):
  - `it('all found on the cited page: onMarks once with their page')` → `onMarks` called once with `([{ index: 0, page: 112 }], 1)`.
  - `it('found only on the next page: reported with that page')` (Review Focus 3) → `([{ index: 0, page: 113 }], 1)`.
  - `it('one on the cited page, one on the next: both, in page order')` → `([{ index: 1, page: 112 }, { index: 0, page: 113 }], 2)`.
  - `it('found on neither page: onMarks with nothing found')` → `([], 1)`.
  - `it('showSentence scrolls to that sentence\'s mark')`: mock `Element.prototype.scrollIntoView`; after marks render, `ref.current!.showSentence(0)`; last call context is a `mark` with `data-sentence="0"`.
  - `reader.page.test.tsx`: the fake PdfView's `miss` / `miss one` buttons call `p.onMarks?.([], 2)` / `p.onMarks?.([{ index: 0, page: 112 }], 2)`; existing "SOURCE (missing all)" / "(missing some)" expectations unchanged.
- [ ] **Step 2: Run** `npx vitest run src/features/reader --maxWorkers=2`. Expected: FAIL (`onMarks` never called, `showSentence` missing).
- [ ] **Step 3: Implement** in `PdfView`: keep per-highlights bookkeeping in the existing `marked` ref (found entries from the cited page, then from the spill page); call `onMarks` once when the cited page has every sentence, or when the spill page is done, or when there is no next page. `onMarksShown` stays as it is (announcement). ReaderPage: `onMarks={(found, total) => setMissing({ for: highlights, found: found.length, total })}` and also stores `found` for Task 5.
- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 && npm run lint && npx tsc -b`. Expected: PASS.
- [ ] **Step 5: Commit?** `refactor(frontend): the PDF view reports which sentences it marked and on which page`

### Task 3: Phones open at "fit the text column"

**Files:**
- Create: `frontend/src/features/reader/textColumn.ts`, `frontend/src/features/reader/textColumn.test.ts`
- Modify: `frontend/src/features/reader/PdfView.tsx` (prop `fit`, opening scale, horizontal start), `frontend/src/features/reader/ReaderPage.tsx` (passes `fit`), `frontend/src/features/reader/Reader.module.css` (`.pages` scrolls sideways when wider)
- Test: `frontend/src/features/reader/pdfview.test.tsx`

**Interfaces:**
- Produces: `textColumn(items: { transform: number[]; width: number; str: string }[], pageWidth: number): { left: number; right: number } | null` (PDF units; left = min `transform[4]`, right = max `transform[4] + width`, items with empty/whitespace `str` ignored; null when no text or the column is under 20% of the page width).
- Produces: `columnScale(viewWidth: number, column: { left: number; right: number }, padding?: number): number` (padding default 12 CSS px each side: `(viewWidth - 2 * padding) / (right - left)`).
- Produces: `PdfViewProps.fit?: 'width' | 'column'` (default `'width'`).

- [ ] **Step 1: Write the failing tests**
  - `textColumn.test.ts`: `it('spans the leftmost to the rightmost text')` (items at x 72 w 400 and x 90 w 450 on a 612 page → `{ left: 72, right: 540 }`); `it('ignores blank items')`; `it('no text, or a sliver: null')`.
  - `columnScale(360, { left: 72, right: 540 })` → `(360 - 24) / 468`.
  - `pdfview.test.tsx`: `it('fit column: the page opens scaled to its text column, scrolled to the column')`: page 112's text content has items at x 72 w 468; `view(112, { fit: 'column' })` with region width 360 (stub `clientWidth`); expect slot 112's `style.width` = `Math.floor(612 * (336 / 468))` px, and `getTextContent` of page 112 was called before any canvas was drawn (spy order). `it('no usable text: falls back to fit width')`.
- [ ] **Step 2: Run** `npx vitest run src/features/reader --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** In the open effect, when `fit === 'column'`, read the start page's `getTextContent()` before `setDoc` and store `column` (or null). `fit` scale = column ? `columnScale(width, column) / ...` expressed as the same base-relative factor the current `fit` uses; null column → today's width fit. After the first jump, set `region.scrollLeft = column.left * scale - 12`. `.pages` gets `overflow-x: auto` and `justify-items: start` when the slots are wider than the view (builder: simplest CSS that keeps desktop centring). ReaderPage passes `fit={layout === 'phone' ? 'column' : 'width'}`.
- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 && npm run lint && npx tsc -b`. Expected: PASS.
- [ ] **Step 5: Commit?** `feat(frontend): phones open the PDF fitted to its text column`

### Task 4: Two-finger zoom, sharp after the fingers lift, with a canvas size cap

**Files:**
- Create: `frontend/src/features/reader/pinch.ts`, `frontend/src/features/reader/pinch.test.ts`, `frontend/src/features/reader/canvasDensity.ts`, `frontend/src/features/reader/canvasDensity.test.ts`
- Modify: `frontend/src/features/reader/PdfView.tsx` (pointer handlers on the pages region, continuous zoom, `onTap`), `frontend/src/features/reader/PageSlot.tsx` (density), `frontend/src/features/reader/Reader.module.css` (`touch-action: pan-x pan-y` on `.pages`; transform layer)
- Test: `frontend/src/features/reader/pdfview.test.tsx`

**Interfaces:**
- Produces: `pinchZoom(start: { distance: number; zoom: number }, distance: number, limits: { min: number; max: number }): number` (zoom × distance / start distance, clamped).
- Produces: `anchorScroll(scroll: { left: number; top: number }, focus: { x: number; y: number }, ratio: number): { left: number; top: number }` (`(scroll + focus) * ratio - focus` per axis; focus is relative to the scroll container's visible box).
- Produces: `canvasDensity(dpr: number, cssWidth: number, cssHeight: number, maxPixels?: number): number` (default `16_777_216`; returns `dpr` when `cssWidth * cssHeight * dpr² <= maxPixels`, else `sqrt(maxPixels / (cssWidth * cssHeight))`).
- Produces: `nextZoomStep(zoom: number, direction: 1 | -1): number` (next value in `ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]` strictly above/below `zoom`, clamped to the ends).
- Produces: `PdfViewProps.onTap?(): void` (one finger, moved under 10px, lifted within 300ms).
- Zoom limits: `min` = the zoom at which the whole page width fits the view; `max` = `4` (relative to the opening scale).

- [ ] **Step 1: Write the failing tests**
  - `pinch.test.ts`: fingers spreading from 100px to 200px at zoom 1 → 2; past max → 4; pinching in below min → min. `anchorScroll({left:0,top:1000},{x:180,y:300},2)` → `{ left: 180, top: 2300 }`.
  - `canvasDensity.test.ts` (Review Focus 2): `canvasDensity(3, 400, 500)` → `3`; `canvasDensity(3, 2448, 3168)`: result × result × 2448 × 3168 ≤ 16,777,216.
  - `nextZoomStep(1.1, 1)` → `1.25`; `nextZoomStep(1.1, -1)` → `1`; `nextZoomStep(4, 1)` → `4`.
  - `pdfview.test.tsx` (fire `pointerdown`/`pointermove`/`pointerup` with `pointerId`, `clientX/Y`, `pointerType: 'touch'`):
    - `it('two fingers spreading on the pages zoom in, and the pages redraw at the new size')`: slot 112 `style.width` grows ×2 after `pointerup`.
    - `it('a pinch that starts outside the pages area does nothing')` (Review Focus 1): the same events dispatched on a sibling element (render PdfView next to a `<div data-testid="strip">`): slot width unchanged.
    - `it('a quick one-finger tap calls onTap; a drag does not')`.
    - `it('the zoom buttons step from the current zoom')`: at width ≥1000 after a pinch to 1.1, "Zoom in" → 1.25 (slot width).
- [ ] **Step 2: Run** `npx vitest run src/features/reader --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pointer handlers on the `.pages` region only (track active pointers in a ref Map). During a two-finger gesture set `style.transform = scale(r)` with `transform-origin` at the focus point on an inner wrapper around the slots (no React state per move); on lift: remove the transform, `setZoom(pinchZoom(...))`, then in the scale effect apply `anchorScroll` instead of the page re-anchor for that one change (keep the page re-anchor for width changes). `PageSlot` uses `canvasDensity(window.devicePixelRatio || 1, viewport.width, viewport.height)` in place of the raw ratio. CSS: `.pages { touch-action: pan-x pan-y }`.
- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 && npm run lint && npx tsc -b`. Expected: PASS (the existing "keeps your page when the width changes" test still passes: Review Focus 5).
- [ ] **Step 5: Commit?** `feat(frontend): two-finger zoom on the PDF pages, sharp after lifting, canvases capped for phones`

### Task 5: The phone reading strip

**Files:**
- Create: `frontend/src/features/reader/ReadingStrip.tsx`, `frontend/src/features/reader/readingStrip.test.tsx`
- Modify: `frontend/src/features/reader/ReaderPage.tsx` (prop `label`, strip on phones, tap hides/shows), `frontend/src/app/ReaderRoute.tsx` (passes `label`), `frontend/src/features/reader/Reader.module.css` (`.strip`)
- Test: `frontend/src/features/reader/reader.page.test.tsx`, `frontend/src/app/readerRoute.test.tsx`

**Interfaces:**
- Consumes: Task 2's `onMarks(found, total)` and `PdfViewHandle.showSentence(index)`; Task 4's `onTap`.
- Produces: `ReadingStrip({ label, sentences, state, onShow }: { label: number; sentences: { index: number; text: string; page: number }[]; state: 'marks' | 'none-on-page' | 'no-sentence'; onShow(index: number): void })`.
- Produces: `ReaderPage` prop `label?: number` (the citation number, set whenever the Reader was opened from a citation, even with no highlights).

- [ ] **Step 1: Write the failing tests**
  - `readingStrip.test.tsx`:
    - `it('shows the first marked sentence with its page and the count')`: two sentences (p. 8, p. 9) → text of sentence 1, `For [1]`, `p. 8`, `1 of 2`.
    - `it('› shows the next one and asks the page to scroll to it')`: click `Next marked sentence` → sentence 2 text, `p. 9`, `onShow` called with its `index`; `‹` back.
    - `it('one sentence: no counter, no arrows')`.
    - `it('no supporting sentence')` (Review Focus 4): `state: 'no-sentence'` → `No single sentence is marked for [1]: the chat card has the whole passage.`
    - `it('none found on the page')`: `state: 'none-on-page'` → `Not found on this page: the sentence is marked in the chat card.`
    - `it('arrows are 44px buttons')`: class check via `app/layout.test.ts` style guard if one exists, else assert `min-height: 44px` in `Reader.module.css` `.stripButton` (same approach as the existing 44px guard).
  - `reader.page.test.tsx`:
    - `it('phone from a citation: the strip appears once the page reports its marks')`: `layout.value = 'phone'`, `label: 1`, `highlights: ['A.', 'B.']`, click fake `marks` button (`p.onMarks?.([{index:0,page:112},{index:1,page:113}], 2)`) → `For [1]`, `1 of 2`.
    - `it('phone, citation with no sentence: the no-sentence line')` (`label: 1`, `highlights: []`).
    - `it('phone from the Library: no strip')` (no `label`).
    - `it('wide and medium: no strip')`.
    - `it('a tap on the page hides the strip, another shows it')` (fake PdfView button calling `p.onTap?.()`).
  - `readerRoute.test.tsx`: `it('passes the citation number to the Reader')` (the mocked ReaderPage renders `label`).
- [ ] **Step 2: Run** `npx vitest run src/features/reader src/app --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** ReaderPage: `state` = no `highlights` → `'no-sentence'`; marks reported with 0 found → `'none-on-page'`; else `'marks'` with `sentences = found.map(f => ({ index: f.index, text: highlights[f.index], page: f.page }))`. Strip renders under the pages inside `.reader` (fixed to the bottom of the Reader, safe-area padding), body text size (`var(--t-16)`), sentence text with the card-style underline. While the PDF is loading or in an error state: no strip. `onShow` → `pdfRef.current?.showSentence(index)`. Route: `label={citation ? n : undefined}`.
- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 && npm run lint && npx tsc -b`. Expected: PASS.
- [ ] **Step 5: Commit?** `feat(frontend): phone reading strip shows the marked sentence at reading size`

### Task 6: Same underline on the card, and the explaining line

**Files:**
- Modify: `frontend/src/features/chat/Chat.module.css` (`.evidence`), `frontend/src/features/chat/ReaderSource.tsx`
- Test: `frontend/src/features/chat/reader.panels.test.tsx`

**Interfaces:**
- Consumes: `supportForCitation` (already used by `SourceCard`) to know whether the card has marks.

- [ ] **Step 1: Write the failing tests** in `reader.panels.test.tsx`:
  - `it('explains the mark when the card has one')`: the existing marked fixture → `Green bar and underline: the sentence Ery used for [1].`
  - `it('no mark, no explanation')`: an answer whose claim matches nothing in the excerpt → the line is absent.
- [ ] **Step 2: Run** `npx vitest run src/features/chat --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.** ReaderSource renders the line (with a small decorative bar swatch, `aria-hidden`) above the card when `supportForCitation(answer.content, n, citation.excerpt).marks.length > 0`. `.evidence` gets `text-decoration: underline 3px var(--accent); text-underline-offset: 3px; text-decoration-skip-ink: none`.
- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 && npm run lint && npx tsc -b`. Expected: PASS.
- [ ] **Step 5: Commit?** `feat(frontend): card marks share the page's underline, and the Source tab explains the mark`

### Task 7: Real-browser check, record, CONTEXT

**Files:**
- Create: `docs/experiments/2026-11-27-reader-marks.md`
- Modify: `docs/CONTEXT.md` (checklist item, test counts in the progress line)

- [ ] **Step 1: Real stack** (backend + `npm run dev`, test user A, cleaned after; session via a 127.0.0.1-only file, never printed): upload `backend/evals/docs/ethics.pdf` (pre-highlighted), ask "What is strict liability?", open the citation.
  - 1440×900: bar + number beside the marked sentence, underline visible over the author's blue highlight, explaining line in the Source tab; screenshot.
  - 390×844 with touch emulation: page opens at the text column, strip shows the sentence with `For [1]`; tap hides/shows; ‹ › move; screenshot.
  - Pinch via CDP `Input.dispatchTouchEvent` with two touch points: page zooms, redraws sharp, toolbar and strip stay; record the largest canvas `width × height` at max zoom (must be ≤ 16,777,216).
  - Library open on 390×844: no strip, column fit. Dark theme: bar stays green on the white page, card underline themed.
  Expected: all as listed, 0 console errors. Note that no iPhone was available.
- [ ] **Step 2: Write the record** (what was built, the measurements, screenshots under `docs/experiments/img/`), update CONTEXT (tick, test counts, "Phase 4 progress:" line kept true).
- [ ] **Step 3: Commit?** `docs: reader marks and phone reading record`
