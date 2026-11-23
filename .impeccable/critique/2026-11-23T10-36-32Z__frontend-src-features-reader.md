---
target: Evidence Reader (features/reader + source cards)
total_score: 30
p0_count: 0
p1_count: 2
timestamp: 2026-11-23T10-36-32Z
slug: frontend-src-features-reader
---
## Design Health Score (app including the Evidence Reader)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | System status | 3 | Reader Source tab ("From your answer") doesn't show the question; counter announces every page while scrolling |
| 2 | Real world | 3 | "Marked in the excerpt only" doesn't say the sentence wasn't found on the page |
| 3 | Control & freedom | 3 | no go-to-page; on phones no way to see the source beside the page |
| 4 | Consistency | 3 | card mark = yellow, page mark = yellow + green underline; "Back to chat" twice |
| 5 | Error prevention | 3 | Chat-tab cards still offer "Open page 8" while on page 8 |
| 6 | Recognition | 3 | claims beside the marked page (excellent) disappear on phones |
| 7 | Flexibility | 3 (was 2) | keys + zoom + ask beside the page; no find-in-PDF, no go-to-page |
| 8 | Minimalist | 3 | excerpt scroll box inside the Chat tab; our mark over the PDF's blue turns olive |
| 9 | Error recovery | 3 | broken PDF: no reason, no fallback |
| 10 | Help | 3 | nothing explains which marks are Ery's |
| **Total** | | **30/40** | **Good** (29 -> 30) |

## Anti-Patterns Verdict
LLM: not slop; plain tool UI. Detector: CLI 0 findings (features/reader, features/chat). Browser: 1 real but defensible hit (zoom control: thin border + wide shadow, floats over the canvas); all else false positives (50 tight-leading/tiny-text hits are the invisible PDF.js text layer, single-font, flat scale, inline mark padding, tab strip flush on its border).

## Priority Issues
1. [P1] Our marks lose to the PDF's own highlights (pre-highlighted lecture PDFs): bright author highlights out-shout #FDE68A; over blue it turns olive; the green underline is the only "ours" signal and is not explained. Fix: unmistakable, colour-independent marker (margin bar/bracket in --accent with the citation number), thicker underline, same underline on the card mark, one-line explanation; option: hide the PDF's own annotations. (/impeccable colorize, clarify)
2. [P1] Phones get a worse Reader than needed: ~6px text at fit-width, no zoom below 1000px, claim and source gone. Fix: open zoomed to the marked passage, a slim claim footer with "1 of 2 marks", zoom from 600px. (/impeccable adapt)
3. [P2] Keyboard/screen reader: slide-over has aria-modal but no focus trap; arrow keys switch tabs without moving focus; page counter announces every page; nothing announces the marks. Fix: <dialog>.showModal or a trap, focus the new tab, announce only after a jump, sr status "Page 8. 2 sentences marked." + Next mark. (/impeccable harden)
4. [P2] Card actions "Show whole passage" / "Open page" are 32px on phones (44px rule). (/impeccable adapt)
5. [P3] Redundancy: Back to chat twice, Source tab without the question, "Open page" for the open page, nested excerpt scroll in the Chat tab. (/impeccable distill)

## Persona Red Flags
First-time student: can't tell Ery's marks from the author's; "Marked in the excerpt only" unclear; counter looks clickable. Keyboard/screen reader: focus escapes the slide-over, chatty counter, marks never announced, ←/→ turn pages. Phone: unreadable page, no zoom, no claim, 32px targets.

## Minor
Focus outline on load reads as a border; "Fit to width" icon reads as fullscreen; zoom max 2x; page labels per page; disabled Ask contrast; dim pages option later.
