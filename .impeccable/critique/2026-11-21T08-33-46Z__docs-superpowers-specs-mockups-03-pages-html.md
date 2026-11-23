---
target: "03-pages.html: Chat, Library, shell (Sage light+dark)"
total_score: 23
p0_count: 0
p1_count: 3
timestamp: 2026-11-21T08-33-46Z
slug: docs-superpowers-specs-mockups-03-pages-html
---
# Critique: 03-pages.html (Chat, Library, shell · Sage light + dark)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | No answer-loading state (qwen takes ~12 s), no upload progress, no "Searched for" line |
| 2 | Match System / Real World | 3 | Plain words ("Not found in your documents", "Failed · Retry"); glyph icons ✦ ◈ ◉ are ambiguous |
| 3 | User Control and Freedom | 3 | Hide sources / sidebar / Focus exist; delete × has no confirm or undo shown |
| 4 | Consistency and Standards | 3 | Coherent tokens; citation 1 filled vs 2 outlined with no stated meaning; "Open in reader" vs "Open page" |
| 5 | Error Prevention | 2 | Tiny × delete next to every row; upload promises PowerPoint (unsupported); "+ Web" looks clickable |
| 6 | Recognition Rather Than Recall | 3 | Labelled nav, recent chats, continue reading |
| 7 | Flexibility and Efficiency | 1 | No focus styles, no shortcuts, many controls are non-focusable divs |
| 8 | Aesthetic and Minimalist Design | 2 | 5 LATER badges, 3-theme picker, + Web, mic, Save/flashcard: unbuilt features as noise |
| 9 | Error Recovery | 2 | Refusal has no next step; no model-down (502) state; Retry on failed docs is good |
| 10 | Help and Documentation | 2 | Good trust copy; no "check the cited page" notice, no first-run empty state |
| **Total** | | **23/40** | **Acceptable** |

## Anti-Patterns Verdict
LLM: not slop at the composition level (familiar chat layout, restrained sage palette, one primary button), but AI tells in the details: side-stripe borders on excerpts and notes, card-inside-card source preview, thin border + wide shadow cards, uppercase tracked h4 labels on every section, 7 font sizes between 10 and 18px.
Detector CLI: 2 warnings (side-tab border-left 4px line 162; flat type hierarchy line 43). Browser: 12 (line-length ~109ch, tiny-text 11px x3, cramped padding x2, nested cards x3, thin border + wide shadow, skipped heading levels x2, clipped overflow on .app). False positives: line-length (mockup intro paragraph, not the app), clipped overflow (the mockup frame), the h1 in skipped-heading (mockup title; the app's own h4-only outline is still a real issue).

## What's Working
1. Sources panel: document, page, exact excerpt, page preview, Open in reader. Directly embodies "the source is the product".
2. Colour tokens pass AA everywhere measured: body text 5.2-14.5:1 in light and dark; one accent for the single primary action.
3. Familiar chat layout and plain-language states (refusal, Ready / Failed · Retry with text, not colour alone).

## Priority Issues
- [P1] Keyboard and screen reader access fail WCAG AA: no :focus-visible styles; search box, recent chats, Continue reading, Open in reader are divs/spans; ~60 glyph/emoji icons with 4 aria-labels; heading outline is h4-only. Fix: real buttons/links, a focus-ring token, lucide icons with text labels, h1/h2 per page. Command: /impeccable harden (then /impeccable audit).
- [P1] Verification promise incomplete: no "check the cited page" notice (required for medical subjects); phone source sheet drops the excerpt (file + page only); citation marker [2] wraps alone onto its own line; no designs for "Searched for" (follow-ups) or "documents disagree" (rule 5). Fix: excerpt in every source view, keep marker with the last word (non-breaking), add the two new states. Command: /impeccable shape (chat states), /impeccable clarify.
- [P1] Missing states: answer loading (up to ~12 s), model unavailable, empty library on first visit, upload in progress (upload is synchronous, so "Preparing…" never shows), refusal without a next step. Command: /impeccable harden, /impeccable onboard.
- [P2] Unbuilt features as noise: 5 LATER badges, Paper/Slate picker (MVP ships Sage only), + Web, mic, Save to notes / Make flashcard, Study and Voice taking 2 of 5 phone tab slots. Command: /impeccable distill.
- [P2] AI-tell details: side-stripe borders (.card q, .ctx, .note), nested card preview, thin border + wide shadow, uppercase tracked labels everywhere, 10-11px text. Command: /impeccable quieter, /impeccable typeset.

## Persona Red Flags
Sam (screen reader, keyboard): cannot Tab to search, recent chats, Continue reading or Open in reader; no visible focus; hears "sparkles", "bookmark"; citation buttons announce only "1".
Casey (phone between classes): source sheet has no excerpt, so checking means leaving the chat; ⌕ search is a tiny top-right target; Study and Voice occupy tab slots but do nothing; a 12 s wait with no progress.
Jordan (first visit): empty library not designed; "SHARED LATER" and "LATER" badges look clickable; the refusal gives no next step; "Nursing 2A" workspace is unexplained.

## Minor Observations
Theme picker always visible for a rare action; borders 1.3:1 so the Ask input relies on fill; thumbs up/down with no stated purpose; delete × same glyph as close.

## Questions to Consider
- What if the phone showed the excerpt right under the answer instead of in a sheet?
- Would the MVP feel more finished with the LATER features hidden instead of badged?
- What should a 12-second wait feel like?
- How should "these documents disagree" look: two cards side by side, linked by the claim?
