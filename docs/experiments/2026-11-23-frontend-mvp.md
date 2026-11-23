# Frontend MVP: built, checked on the real stack, critiqued

Date: 2026-11-21 to 2026-11-23 · Branch: `feat/frontend-chat` · Phase 3
Design: `docs/superpowers/specs/2026-11-21-frontend-mvp-design.md` · Plan: `docs/superpowers/plans/2026-11-21-frontend-mvp.md`
Critiques: `.impeccable/critique/` (mockup 2026-11-21, real app 2026-11-23)

## TL;DR

- A student can sign up (email or Google), upload PDFs, ask questions and check every cited excerpt in the browser.
- Design critique: **23/40 for the mockup → 28/40 for the real app** (Nielsen heuristics). All P1s from the mockup are fixed.
- Checked on the real stack (FastAPI + Supabase + Ollama), at 14 screen sizes, keyboard only, light and dark.
- 180 frontend tests (Vitest + React Testing Library), lint, type check and production build clean.

## What was built

| Part | Notes |
|---|---|
| Architecture | folders by feature (`features/auth, library, chat`), `shared/` base, `app/` composes; only each feature's `api.ts` knows backend URLs |
| Auth | email login and register (works with "Confirm email" on or off), Google (PKCE), 8+ character passwords, cache cleared on logout or user switch, safe return to the wanted page after login |
| Library | big drop zone when empty; compact "Upload PDF" (and drop anywhere) once documents exist; Ready / Couldn't read it / Didn't finish reading, Try again, delete with an inline confirm |
| Chat | new chat, follow-ups with "Searched for", citation markers that never wrap alone, sources with the exact excerpt, the check-the-page notice, pending / still working / model down / backend down / refusal states, answers that survive navigating away |
| Shell | no top bar on desktop (logo and account in the sidebar), account menu (email, light/dark, Log out), phone tabs, drawer with a Motion spring |
| Login | split: form + a real example answer with its source (our own chat components, sample data, `inert`) |
| Security | text-only rendering of model output (no links, no HTML), token never sent outside our API, build-time CSP (the build fails without it), `vercel.json` rewrite + security headers |

## Checklist on the real stack (test user A, cleaned afterwards)

| Check | Result |
|---|---|
| PNG refused before sending · upload → Ready | ✓ |
| ask → pending, Ask disabled → `/chat/:id` → cited answer; citation click; check-the-page notice | ✓ |
| follow-up → "Searched for: Who does strict liability apply to?" (real rewrite) | ✓ |
| reload keeps the chat · chat in Recent | ✓ |
| backend down → "Can't reach the server" + Try again (question kept) | ✓ |
| model down (backend pointed at a dead Ollama) → "Ery can't answer right now. The model isn't running." in 2.3 s | ✓ fail-fast from the follow-up review works live |
| model back → Try again answers | ✓ |
| delete asks first (Cancel focused) · deleted document → its citation says "Source removed" | ✓ |
| "/" with an empty library → Library | ✓ |
| 14 sizes (320-2560, 844×390 landscape, 1080×1920 vertical, 640 ≈ 200% zoom) × chat + library: no sideways scroll | ✓ |
| keyboard only: New chat → Library → Recent → Account → markers → question box | ✓ |
| log out → /login; back button shows no chat data | ✓ |
| Google: button → Supabase (PKCE) → Google sign-in page with the right client and callback | ✓ (by Claude, up to Google) |
| owner's own Google login and an email registration | owner |

## Found by looking (not by unit tests) and fixed

| Found | How | Fix |
|---|---|---|
| file icon alone on its own line at 360px | screenshot | icon + name grouped |
| "Sources (n)" lost its open/close arrow | screenshot | chevron |
| composer floating mid-screen; empty chat off-centre | screenshot + measuring | full-height column; two columns only when there are sources |
| question box had no visible focus ring | keyboard run | 2px ring on the composer (+ test) |
| **phone: the tab bar covered the question box in any chat with messages** | critique, `elementFromPoint` | composer sits above the tab bar (`--tabs-h`) (+ test) |
| login preview: card inside a card + wide shadow | detector in the browser | frame removed |
| answer lines ~89 characters | detector | 60ch |
| upload could be sent as `/workspaces/undefined/...` by a script | backend log | guard in the data layer too (+ test) |
| "Untitled chat" shown while a chat was still loading | screenshot | empty heading until the data arrives (+ test) |
| **wide screens: Library left of centre (211 px empty left, 651 right at 1870), jumping 112-220 px sideways vs New chat** | owner's screenshot, measured | one alignment rule: each page centres its own 760 px column; the >= 1600 px shell rule removed (+ test) |
| login form hugged the left edge (410 px empty beside it at 1870) | owner's screenshot | form centred in its half, logo in the corner, example 600 px (+ test) |
| chat sources floated; the mockup had them docked | mockup vs app | docked panel: full height, own background and scroll, divider (+ test) |
| Library list had no column headings or dates (the mockup had a table) | mockup vs app | Name / Added / Status table; stacked with labels when narrow (+ test) |
| "Delet / e" broke in the first table try | screenshot | column widths measured in the browser; button labels never wrap |

Lesson: **"visible" is not "usable"**. The first responsive check asked whether the question box was visible; a box under the tab bar is still visible. The right check is whether it is the top element at that spot.

Lesson 2: **placement, not width**. A wide screen should show more (a docked panel, table columns), not the same content stretched; and everything that stays narrow must sit in one place on every page. The mockup could not show this: it is a fixed 1280x700 frame.

Wide-screen check after the fix (fake API, 14 sizes, light + dark): New chat vs Library jump 0 px at every size; Library space left = right; sources panel from the top bar to the bottom of the screen; title in line with the messages; question box the top element; no sideways scroll.

## Design critique

| | Mockup (2026-11-21) | Real app (2026-11-23) |
|---|---|---|
| Score | 23/40 Acceptable | **28/40 Good** |
| P0 / P1 | 0 / 3 | 1 / 1 → P0 fixed in this branch |
| Detector (source) | 2 | 0 |

Left open, by choice: the evidence highlight (P1: show the cited sentence in the excerpt instead of a scroll box), no keyboard shortcuts, no cancel for a pending answer, no rename/delete for chats.

## Findings for other phases

- The bonsai rewriter added the old topic to a complete new question ("What is whistle-blowing?" → "… in relation to strict liability?") → refusal. Rewrite rules v2 / eval.
- With Google misconfigured the app showed Supabase's raw JSON error page (config error only).
- Bundle 213 KB gzipped: route code-splitting later.

## Reproduce

```bash
cd backend && ../.venv/bin/python -m uvicorn app.main:app --port 8000
cd frontend && npm run dev          # http://localhost:5173, component states at /dev/states
npm test && npm run lint && npm run build
```
