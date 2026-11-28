# Reader marks and phone reading: design

Date: 2026-11-27 · Branch: `feat/reader-marks` · Follows: `2026-11-23-evidence-reader-design.md`
Source: the Reader critique's two P1s (`.impeccable/critique/2026-11-23T10-36-32Z__frontend-src-features-reader.md`)

## Why

The Reader exists so a student can check an answer against the real page. Two things break that today:

1. **Marks get lost on PDFs the author already highlighted.** Lecture PDFs often arrive highlighted in bright
   yellow, blue or pink. Our mark is a pale yellow tint (multiplied into the page) plus a 2px green underline:
   bright author yellow out-shouts it, over author blue it turns olive, and nothing explains the underline. The
   student can't tell which highlight is the evidence.
2. **On a phone the evidence is unreadable.** At fit-width the page text is about 6px and there is no zoom below
   1000px, so the student lands on the right page but cannot read the marked sentence. The owner's goal for phones:
   **just read the marked sentence** (the phone Reader stays minimal: page + Back).

Measured before designing (2026-11-27, 138 real eval answers): the matching itself is fine (85% of qwen claims
marked, 12/12 sampled marks right), so this is about how marks look and read, not which sentence is picked.

## Goals

- Our mark is recognisable as "Ery's evidence" by **shape and position, not colour**, on any page, highlighted or not.
- The page mark and the chat card mark look related (same underline).
- One plain line explains the mark.
- On a phone, the student reads the marked sentence at normal reading size without panning or pinching, and still
  sees where it sits on the page.
- Two-finger zoom on the page on every touch screen, sharp after the fingers lift.

## Non-goals (now)

- Hiding the PDF's own highlights (considered as a switch; left for later, with the notes layer).
- Saved highlights, pen, notes (the future layer; this work must not block it).
- Go-to-page, find in PDF, range loading (backlog).
- Changing which sentence is marked (`shared/evidence.ts`, `textMatch.ts` stay).

## Anti-goals (failure even if it "works")

- A mark that could be mistaken for the author's highlight.
- Strip text that is not what the page says.
- Zoomed text that stays blurry, or a zoom that loses the student's place.
- The toolbar or reading strip sliding off screen while zooming.
- A phone that crashes or reloads the tab at high zoom (canvas memory).

## Decisions (made with the owner)

### Marks: option B, margin marker + thick underline (chosen from A today / B / C green box)

- **No colour fill** on page marks: the author's highlight stays exactly as it was; ours never mixes with it.
  (Today's `#FDE68A` + `mix-blend-mode: multiply` fill is removed from page marks.)
- **3px green underline** (`#2F6F4F`, fixed, not themed: PDF pages are white in both themes) under the marked words.
- **Margin bar** beside each marked sentence: a 4px green bar from the sentence's first line to its last, just left of
  the text, with the **citation number** in a small green circle at its top ("1" for `[1]`).
- Drawn in the page's `marksLayer` (the layer reserved for marks, pen and notes; positions relative to the page,
  so it zooms with it). The bar and number are decoration (`aria-hidden`); the marked text is still real selectable
  text in the text layer, and the existing announcement ("2 sentences marked.") stays.
- **Chat card mark** (`SourceCard` `.evidence`): keeps its light `--hl` tint (card excerpts have no author colours)
  and gets the same 3px underline in `--accent` (themed: the card follows light/dark).
- **Explaining line**: wide screens show it in the Source tab, above the card: a small bar swatch with the number +
  "the sentence Ery used for [1]". On phones the strip header does this job.

### Phone: option C, page + reading strip (chosen from A zoom-in / B fit text column / C strip)

- Applies to the **phone layout** only (`useReaderLayout` = `phone`: under 600px wide or under 500px tall, so phones
  held sideways too). Medium and wide keep their Source panel.
- The page opens at **"fit the text column"**: the scale at which the cited page's text (left edge of its leftmost
  text to right edge of its rightmost text, plus a small gap) fills the width, scrolled so that column is in view
  and the first mark is in the upper part of the screen above the strip.
- A **reading strip** at the bottom shows the marked sentence in normal reading size (the app's body text), with the
  same green underline. Header: "On this page, for [1]" and, when there are several marked sentences, "1 of 2 ›"
  (and "‹" back): moving scrolls the page to that sentence's mark.
- The strip text is the **matched sentence's clean text** (the supporting sentence the page matched). The match
  compares every letter and digit, so the words are proven identical to the page's, without the PDF's broken pieces
  ("responsi-" / "bility"). Only sentences actually found on the page are offered.
- None found on the page: no strip of sentences; the strip says "Not found on this page: the sentence is marked in
  the chat card." (same meaning as the Source tab's notice). Some found: only those, nothing more to say.
- **Tap the page** (not a drag) hides / shows the strip, so the whole page is visible when wanted.
- Opened from the Library (no citation): no strip.

### Two-finger zoom: our own pinch on the pages (chosen from browser zoom / ours / browser zoom + sharpen)

- On every touch screen (phone, tablet), on the pages area only. The toolbar and strip never zoom or move.
- During the gesture the pages are scaled with a CSS transform around the point between the fingers (instant,
  smooth). When the fingers lift, the new zoom is committed and PDF.js redraws the visible pages at that size
  (the existing scale effect), and the scroll position is set so the point under the fingers stays under them.
- The browser's own pinch-zoom is turned off for the pages area only (`touch-action: pan-x pan-y`), one-finger
  scrolling stays native.
- Zoom becomes continuous (not only the button steps). The wide-screen buttons keep working: "Zoom in/out" go to the
  next step up/down from the current zoom; "Fit" returns to the opening scale.
- Zoom range: from the whole page fitting the width, up to about 4× the opening scale (builder: exact limits, see
  canvas memory below).

## Constraints

- **Canvas memory.** Zoomed pages on high-density phones make huge canvases (iOS Safari refuses canvases above
  about 16.7 million pixels and limits total canvas memory). Each page's canvas must be capped: lower the drawing
  density (the device-pixel-ratio factor) so one canvas never exceeds that area. Still at most the visible page ±1
  drawn, and canvases emptied when they leave (already done).
- **No new runtime dependency** for gestures: pointer events are enough.
- Reader code stays in `features/reader/` and never imports `chat/` (the strip gets plain data from the route:
  sentences and the citation number). `app/ReaderRoute.tsx` composes.
- The existing keyboard, focus and screen-reader behaviour stays (PageUp/PageDown, focus on the pages, announcements
  only on jumps and mark counts). The strip's ‹ › are real buttons, 44px on phones.
- `prefers-reduced-motion`: scrolling to a mark is instant, no animated scroll.
- Tests run in jsdom (no real drawing): the geometry (bar from mark rectangles, text-column scale, pinch maths,
  scroll anchoring) goes into small pure functions with unit tests; components get event-level tests. A real-browser
  check at phone sizes with touch emulation follows. An iPhone is not available here: say so in the record.

## Approaches considered

| Part | Options | Chosen and why |
|---|---|---|
| Mark look | A today (tint + thin underline) · B margin bar + number + thick underline, no fill · C green outline box | **B**: recognisable by shape/position, never mixes with author colours; C is busy on long sentences |
| Phone reading | A open zoomed (~2.5×, swipe sideways per line) · B fit the text column (~8px) · C page + reading strip | **C**: the only one where the student just reads; the page still shows where |
| Pinch | 1 browser zoom (no code, blurry, toolbar/strip zoom too) · 2 our own pinch + redraw · 3 browser zoom + sharpen | **2**: sharp, toolbar and strip stay put, builds on the existing zoom, and the future pen/notes need a page that knows its scale |

## Calls made after the builder check (my calls; the owner can overrule)

1. **A citation where no sentence clearly supports the claim** (about 15% of qwen claims: summaries, "the passages
   disagree"): the card has no mark either, so "marked in the chat card" would be false. The route passes the
   citation number even when there are no sentences. On phones the strip shows one line: "No single sentence is
   marked for [1]: the chat card has the whole passage." On wide/medium screens the explaining line is not shown
   (there is no mark to explain).
2. **Sentences found on the next page** (a passage that continues): they count. The strip offers every sentence
   found on the cited page or the next one, in page order; each shows its page ("p. 8", "p. 9") and ‹ › scrolls to it
   across the page break. The header becomes "For [1]" (not "On this page") so it stays true. Only when none is
   found on either page does the strip say "Not found on this page: the sentence is marked in the chat card."
   So `PdfView` reports, per sentence, whether it was found and on which page (not only counts), plus a way to scroll
   to its mark.
3. **Opening scale on phones without a citation** (Library opens, case 1): always "fit the text column", measured
   on the page being opened. To avoid a visible jump, the first draw waits for that page's text positions (one
   extra small request, before any canvas is drawn). "Fit" returns to that scale; the lowest zoom is the whole page
   width.
4. **Scrolling away from the cited pages**: the strip stays (it is about the citation, not the scroll position); its
   page labels say where the sentences are, ‹ › brings the page back to them, and tapping the page hides the strip.
5. **The explaining line** also appears in the medium slide-over's Source tab (same card as the docked panel).

## Left to the builder

- Exact sizes (bar offset from the text, number circle size, strip padding and max height), within the app's tokens.
- Pinch limits and the canvas density cap formula; whether zoom buttons appear on tablets.
- How "tap vs drag" is told apart (movement threshold).
- Where the pure helpers live (`features/reader/`), and the order of tasks.
