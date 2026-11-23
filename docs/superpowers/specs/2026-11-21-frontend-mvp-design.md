# Frontend MVP: shell, auth, Library, Chat — design

Date: 2026-11-21 · Branch: `feat/frontend-chat` · Phase 3 (last item)
Builds on: `docs/superpowers/specs/2026-11-15-frontend-design.md` (layout, tokens, pages; sections 14-17 win),
`PRODUCT.md` (users, principles, WCAG 2.2 AA), critique `.impeccable/critique/2026-11-21T08-33-46Z__…03-pages-html.md` (23/40).
Status: for review. Lines marked **(my call)** were settled by Claude while checking the design; safe to change.

## Why

The backend can upload, index, answer with citations, handle follow-ups and keep chats, but a student can only use
it through the API. This branch builds the first real screens so the whole loop works in a browser: sign up, upload
PDFs, ask, check the cited excerpt. It also sets a clean frontend architecture that later features (Reader, Notes)
slot into without a rewrite.

## Goals

- Login, Register (email/password, optional Google), log out.
- Library: upload a PDF, see it become Ready, retry a failed one, delete one.
- Chat: new chat, ask, see the answer with citation markers, check each source's exact excerpt, reopen past chats,
  follow-ups (the backend rewrites them; the screen shows "Searched for").
- Every state designed, not only the happy path: loading, empty, error, refusal, model unavailable.
- WCAG 2.2 AA in light and dark (Sage).
- Feature-based architecture and folders that are easy to navigate.

## Non-goals (this branch)

- Reader / "Open in reader" (needs a backend file-link endpoint): next branch.
- Search results page, Notes, Bookmarks, Study, Voice, web research, shared workspaces, workspace switcher.
- Paper and Slate themes (tokens make them a values-only addition later).
- Hide-panels / Focus mode, renaming or deleting chats (my call: Should-level, cut until Phase 4).
- Editing a chat's tone `instructions` (the API supports it; no screen yet, my call).
- Streaming answers (the backend returns the whole answer).
- Any backend change.

## Anti-goals

- A screen that shows features that do not work (no LATER badges, no dead buttons).
- An answer whose source cannot be checked in one step, on any screen size.
- Model output rendered as HTML.
- Components that call `fetch` or know backend URLs.

## Constraints

- Stack in place: Vite, React 19, TypeScript, supabase-js. Env: `VITE_API_URL`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`. Backend CORS allows `http://localhost:5173`.
- Backend endpoints used (all exist):

| Screen | Endpoint |
|---|---|
| any, first | `GET /workspaces` (creates the hidden "Personal" workspace on first call) |
| Library | `GET /workspaces/{ws}/documents` · `POST /workspaces/{ws}/documents` (multipart `file`) · `POST /documents/{id}/index` (retry) · `DELETE /documents/{id}` |
| Chat | `POST /workspaces/{ws}/conversations` · `GET /workspaces/{ws}/conversations` · `GET /conversations/{id}` · `POST /conversations/{id}/messages` |

- Upload is synchronous: the request returns after indexing (can take a while), status `indexed` or `failed`.
  There is no "Preparing…" state to show.
- Answers are not streamed. A follow-up costs two model calls; qwen can take ~12 s.
- "Documents disagree" has no API flag: it exists only in the answer text (rule 5). The screen shows the answer
  and all its sources; no special styling. A flag is a later backend item.
- Citations carry `n, chunk_id, document_id, filename, page, excerpt`; `document_id` null = source removed (ADR-003).

## Approaches considered

| Decision | Options | Chosen | Why |
|---|---|---|---|
| Folder structure | by type (`components/ pages/ hooks/`) · **by feature with a shared base** · Feature-Sliced Design | **by feature** | a chat change stays in `features/chat/`; Reader later = a new folder; FSD is heavy for 3 features |
| Build order | whole UI then wiring · **per feature: look first (sample data, all states), then wire** · all at once | **per feature, look first** | every state is visible before wiring, including ones hard to trigger for real |
| Register | confirm-email only · no confirmation · **support both** | **both** | the frontend reads Supabase's reply (session or not); the dashboard setting decides |
| Social login | **Google only** · Google + GitHub · later | **Google** (owner accepted the recommendation) | students have Google; button shown only when `VITE_AUTH_GOOGLE=true` |

## Architecture

```
Page (features/*/XPage)      composes components, owns screen state, uses the feature's hooks
  │
Components (features/*/…)    show data, report clicks; no fetch, no URLs
  │
Feature hooks + api.ts       TanStack Query hooks; api.ts is the only place with backend URLs and JSON types
  │
shared/http.ts               adds the Supabase token, maps failures to one ApiError type
  │
FastAPI → Supabase
```

Rules: features import `shared/`, never each other. Only `features/*/api.ts` calls `shared/http`. Types for backend
JSON live in each feature's `types.ts`.

### Folders

```
frontend/src/
  main.tsx                    mounts <App/>
  app/
    App.tsx                   providers (QueryClient, session) + routes
    routes.tsx                route table, auth guard
    AppShell.tsx (+ .module.css)   top bar, sidebar (desktop), bottom tabs (phone)
    DevStates.tsx             /dev/states, only when import.meta.env.DEV
  features/
    auth/      LoginPage, RegisterPage, CheckInboxPage, useSession.ts, GoogleButton
    library/   LibraryPage, UploadZone, DocumentRow, EmptyLibrary, api.ts, types.ts, hooks.ts
    chat/      ChatPage, ChatList (sidebar), MessageList, UserMessage, AnswerMessage, CitationMarker,
               SourcesPanel, SourceCard, Composer, PendingAnswer, api.ts, types.ts, hooks.ts,
               parseCitations.ts
  shared/
    http.ts, supabase.ts, workspace.ts (useWorkspaceId: GET /workspaces once)
    ui/       Button, IconButton, TextField, InlineConfirm, EmptyState, ErrorState, Spinner, VisuallyHidden
  styles/
    tokens.css                Sage light + dark variables (from the 2026-11-15 design, with the fixes below)
    base.css                  reset, typography scale, focus ring, reduced motion
```
Tests sit next to the file they test (`SourceCard.test.tsx`). The old `Login.tsx`, `Library.tsx`, `App.css`,
`index.css` and Vite template assets are removed.

### Libraries

React Router (routes), TanStack Query (server data: loading, error, retry, cache), CSS Modules + `tokens.css`
(styling), lucide-react (icons, always with a text label or `aria-label`), Motion (~30 KB; springs and layout
animation only, see Motion), Vitest + React Testing Library (tests). Font: DM Sans, self-hosted with `@fontsource/dm-sans` (my call: no request to Google's servers). No UI kit.

## Routes

| Route | Screen | Guard |
|---|---|---|
| `/login` | Login | signed-out only |
| `/register` | Register | signed-out only |
| `/check-inbox` | "Check your inbox" after Register without a session | signed-out only |
| `/library` | Library | signed in |
| `/chat` | new chat (empty) | signed in |
| `/chat/:id` | existing chat | signed in |
| `/` | redirects to `/chat` (or `/library` when the library is empty) | signed in |
| `/dev/states` | every component state side by side | dev build only |

A 401 from the API signs out and sends the user to `/login`.

## Shell

```
┌─────────────────────────────────────────────────────────────┐
│ ☰ Eryysyn                                     ◐ Dark   (G)▾ │  top bar: sidebar toggle, logo, light/dark, account (Log out)
├────────────┬────────────────────────────────────────────────┤
│ + New chat │                                                │
│ Chat       │   page                                         │
│ Library    │                                                │
│ Recent     │                                                │
│  · chat 1  │                                                │
│  · chat 2  │                                                │
└────────────┴────────────────────────────────────────────────┘
phone: one column, bottom tabs [Chat] [Library], recent chats inside Chat as a list (see Responsive)
```
Only features that work appear. Light/dark follows the device by default; the choice is saved in the browser.

## Auth

- **Login**: email, password, "Log in", link to Register; "Continue with Google" above when enabled. Errors in plain
  words next to the form ("Wrong email or password", "Can't reach the server"). The password field has a show toggle.
- **Register**: email, password (min 6, Supabase's rule, shown as a hint), "Create account". After `signUp`:
  session returned → `/library`; no session → `/check-inbox` ("We sent a link to x@y. Open it, then log in.").
  "Already registered" → message with a link to Login.
- **Google**: `signInWithOAuth({ provider: "google", options: { redirectTo: origin } })`. Setup outside the code
  (Google Cloud credentials, Supabase provider, redirect URLs) is documented in the README, not automated.

## Library

```
Library
Your documents. Only you can see them.
┌───────────────────────────────────────────────────────────┐
│   Drop a PDF here, or  [Choose a file]    PDF · up to 20 MB│
└───────────────────────────────────────────────────────────┘
Vital Signs, ch. 12.pdf                  ✓ Ready         Delete
Scanned handout.pdf                      ! Couldn't read it  [Try again]  Delete
```
States:
- **First visit, empty**: what Eryysyn does in one line, the upload zone as the only action, and "After uploading,
  ask questions in Chat."
- **Uploading**: the row appears at once with "Uploading and reading… this can take a minute", the zone is disabled
  for that file; the request is synchronous, so no fake progress percentage.
- **Client-side checks before sending**: not a PDF → "Only PDF files for now."; over 20 MB → "This file is over
  20 MB." (the backend also checks).
- **Ready** (`indexed`), **Couldn't read it** (`failed`) with **Try again** (`POST /documents/{id}/index`).
- **Delete**: inline confirm in the row ("Delete Vital Signs…? [Delete] [Cancel]"), not a modal.
- **List error**: ErrorState with Retry.
Status always has icon + text, never colour alone.

## Chat

```
New chat                                                       Sources
┌────────────────────────────────────────────┐   Check the cited page before relying on an answer.
│                 What is strict liability?  │   ┌──────────────────────────────────┐
│                                            │   │ 1  ethics.pdf · p. 8             │
│ A manufacturer can be liable even if the   │   │ "…manufacturer of the product    │
│ product met all safety standards. [1]      │   │  can be found liable…"           │
│                                            │   └──────────────────────────────────┘
│                        who does it apply to│
│        Searched for: Who does strict       │
│        liability apply to?                 │
│ ◌ Ery is reading your documents…           │
│ [ Ask about your documents…        ] [Ask] │
└────────────────────────────────────────────┘
phone: sources under each answer: "Sources (2)" expanded by default, same cards with the excerpt
```
- **New chat**: empty state "Ask a question about your documents." If the library is empty: "Upload a PDF first"
  with a link to Library. The first question creates the conversation (`POST …/conversations`, then the message),
  then the URL becomes `/chat/:id` and the chat appears in Recent.
- **Sending**: the question shows at once; "Ery is reading your documents…" below it; Ask disabled; Enter sends,
  Shift+Enter new line; the typed text is kept if the request fails.
- **Answer**: text rendered by `parseCitations`: plain text split at `[n]` markers; each marker becomes a
  `CitationMarker` button ("Source 1, ethics.pdf page 8" for screen readers) glued to the previous word with a
  non-breaking space so it never wraps alone. No HTML, no markdown rendering. Paragraph breaks kept.
- **Clicking a marker**: highlights its SourceCard and scrolls it into view (desktop panel or phone list).
- **SourceCard**: number, file name, page, the exact excerpt (full, scrollable if long). `document_id` null →
  "Source removed" label. No "Open in reader" yet.
- **"Searched for: …"**: small muted line under the user's message, only when `search_question` differs from the
  typed text (ignoring case and spacing).
- **Refusal** (`refused: true`): "Not found in your documents." plus a next step: "Try other words, or check the
  document is in your Library." No sources panel content.
- **Model unavailable** (502): inline ErrorState under the question: "Ery can't answer right now. The model isn't
  running." with Retry (resends the same text). 404 on a chat → "This chat no longer exists" + New chat.
- **Disagreement**: shown as the answer says it, with both sources listed; no special styling (no API flag).
- **"Check the cited page before relying on an answer."**: always at the top of the sources panel / list.
- **Which sources the panel shows** (my call): the sources of one answer at a time, by default the newest; clicking
  a marker in an older answer switches the panel to that answer. Each answer numbers its sources from 1, so this
  avoids mixing two answers' [1]s.
- **Reopening a chat**: `GET /conversations/{id}` returns messages in order with their citations; the user messages
  carry `search_question` (null on old ones: nothing shown).
- **If the first message fails after the conversation was created** (my call): stay on `/chat/:id` with the error and
  Retry; the chat stays in Recent as "Untitled chat" until a question succeeds.
- **Recent chats** in the sidebar: `GET …/conversations`, newest first, title or "Untitled chat"; current one marked.
  Refreshed after a new chat is created.

## Responsive: every width, height and split screen

Lay out by **available space, not device names**. Container queries on the main area decide the chat layout, so a
hidden sidebar, a split screen or a vertical monitor all get the layout that fits.

| Main area / viewport | Layout |
|---|---|
| width < 600px (phone, narrow split) | one column · bottom tabs [Chat] [Library] · sources under each answer ("Sources (n)", open by default) |
| 600-960px (tablet portrait, half split) | icon sidebar with labels on hover and focus · sources under each answer |
| ≥ 960px | full sidebar · chat · sources panel beside the chat when the chat container is ≥ ~820px, else under answers |
| ≥ 1600px (wide, 4K) | same, centred, max widths keep lines ≤ 65ch, more space around |
| height < 500px (landscape phone) | compact top bar, no bottom tabs (menu button instead), composer always reachable |

Rules:
- Intrinsic sizing (`minmax()`, `max-width: 65ch`, `flex-wrap`, `repeat(auto-fit, minmax(…))`) so 400px and 600px
  reflow differently instead of stretching one layout. Breakpoints only where the arrangement itself changes.
- Height and width queries, not `orientation` (unreliable in split screen).
- `dvh` units for full-height areas (mobile address bar) and `env(safe-area-inset-*)` padding (notch, home bar),
  with `viewport-fit=cover`.
- Fixed rem type scale (product register); readable at 200% zoom and with large system text, no sideways scroll
  from 320px up.
- Test matrix (manual checklist in the plan): widths 320, 375, 414, 480, 600, 768, 1024, 1280, 1440, 1920, 2560;
  landscape phone 844×390; vertical monitor 1080×1920; tablet split 50% and 33%; zoom 200%.
- Inspiration, what to borrow: NotebookLM (panels collapse in order), Perplexity (numbered source cards beside the
  answer), ChatGPT / Claude.ai (phone composer, sidebar drawer, answer width), iOS Messages / Notes (motion, safe
  areas, press feedback), Linear (calm product UI, small type scale).

## Motion: smooth, iOS-like, never in the way

Principles: motion shows where things come from; springs settle without bouncing (critically damped); short
(150-300 ms), interruptible, and only for state changes. Animate `transform` and `opacity` only. One shared curve:
`cubic-bezier(0.22, 1, 0.36, 1)`.

| Moment | Motion | Tool |
|---|---|---|
| question sent | rises and fades in from the composer (200 ms) | CSS |
| "Ery is reading your documents…" | a calm breathing dot | CSS |
| waiting > 5 s | a line appears: "Still working. Local models can take up to ~15 s." (honest, no fake progress) | CSS |
| answer arrives | fades in; sources panel cross-fades to the new cards | CSS |
| citation clicked | card scrolls into view and glows briefly | CSS |
| page change (Library ↔ Chat) | short cross-fade, shell stays still | View Transitions API via React Router |
| phone / narrow sidebar drawer | slides in with a settling spring, backdrop fades | Motion |
| document added / deleted, chat list changes | items slide to their new place | Motion (layout animation) |
| buttons | press-down scale 0.97 | CSS |

`prefers-reduced-motion: reduce` → instant swaps or a plain 150 ms fade, everywhere. Motion is never needed to see
content (content is visible first, animation only enhances it).

## Caching

- **TanStack Query** in the browser caches the chat list, documents and open chats: switching screens shows data at
  once and refreshes it in the background. Asking a question updates that chat and the Recent list.
- **Static files**: Vite's hashed file names allow long browser caching (set at deployment).
- **No Redis in this branch.** Redis belongs next to the backend for a job queue (background indexing) and rate
  limiting: Phase 8. Answer caching stays rejected (questions rarely repeat; answers go stale).

## Security (frontend)

| Risk | Defence |
|---|---|
| XSS through model output, file names, excerpts | text only, React escaping, never `dangerouslySetInnerHTML`; `parseCitations` outputs text and buttons only; URLs inside answers are shown as plain text, not links (a planted page could add a phishing link, held-out h08) |
| token theft (supabase-js keeps the session in `localStorage`) | no third-party scripts, self-hosted font, a strict Content Security Policy (`script-src 'self'`; `connect-src` only the API and Supabase); httpOnly-cookie sessions need a server layer: noted for Phase 8 |
| OAuth | PKCE flow (`flowType: "pkce"`), redirect only to our own origin, allowed redirect URLs listed in Supabase |
| shared computer | logging out (and a different user signing in) clears the TanStack Query cache |
| clickjacking | `frame-ancestors 'none'` |
| keys | only the publishable key in the frontend, never `service_role`; `frontend/.env` is git-ignored (checked) |
| authorization | the backend decides (ownership checks, 404); hiding a control is never a security measure |
| uploads | browser checks are convenience only; the backend checks type and size again |
| dependencies | few libraries, lockfile committed, `npm audit` in the checklist |

The CSP is added as a `<meta http-equiv="Content-Security-Policy">` tag to the **production build only** (a small
Vite plugin adds it in `transformIndexHtml` when building), because the dev server and React fast-refresh insert an
inline script that `script-src 'self'` would block. Checked with `npm run build && npm run preview`. The real HTTP
header comes with hosting (Phase 8). Browsers ignore `frame-ancestors` in a `<meta>` tag, because framing is
decided before the page is read.

**Vercel (the planned host): `frontend/vercel.json` is written now** with everything that does not depend on unknown
URLs:
- SPA rewrite: every path serves `index.html`, so reloading `/chat/123` works instead of a 404.
- Headers: `Content-Security-Policy: frame-ancestors 'none'` (clickjacking), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Added at deployment (Phase 8), once the backend's public URL is known: the full CSP as a header (`script-src`,
  `connect-src` with the real API and Supabase URLs), replacing the build-time `<meta>` tag.

Inline confirms on destructive actions also make clickjacking harder in the meantime.

## Visual rules (critique fixes, P1 + P2)

- Tokens from the 2026-11-15 Sage set (light + dark). Add `--line-strong` for input and control borders with at
  least 3:1 against the surface, and `--focus` for a 2px focus ring visible in both modes.
- Type scale, rem-based, ratio about 1.2: 12 / 14 / 16 / 19 / 23 px. Nothing under 12px. Body 16px. Answer text
  max 65ch. Sentence-case section labels (no tiny uppercase tracked labels).
- No side-stripe borders, no card inside a card, no thin-border + wide-shadow cards: cards use a full 1px border
  and a surface tint; the excerpt is a quoted block with a tinted background.
- Icons: lucide with visible text or `aria-label`; no emoji.
- Motion: see the Motion section; nothing under `prefers-reduced-motion`.

## Accessibility (WCAG 2.2 AA)

Real `<button>`/`<a>` for every control; visible focus everywhere; logical heading outline (one h1 per page);
form fields with labels and error text linked by `aria-describedby`; `aria-live="polite"` for "Ery is reading…",
the arrived answer, upload results and errors; 44px touch targets on phone; light and dark both checked for 4.5:1
text and 3:1 controls; works keyboard-only from login to checking a source.

## Testing

- **Unit / component (Vitest + RTL, with sample data, no network)**: `parseCitations` (markers, invalid numbers,
  brackets in text, no HTML injection), CitationMarker label and glue, SourceCard (removed source), Searched-for
  shown only when different, Refusal, PendingAnswer, ErrorState retry, UploadZone client checks, DocumentRow states
  and inline confirm, Register outcomes (session / no session / already registered), route guard.
- **API layer**: `shared/http` (token header, 401 → sign out, 502 → ApiError kind "unavailable", network error),
  feature `api.ts` with a fake `fetch`.
- **Manual end-to-end** against the real backend and Supabase, as a checklist in the plan (upload → Ready → ask →
  check excerpt → follow-up shows Searched for → reload keeps chat → model stopped shows the 502 state).
- Security tests: an answer containing `<script>`, `<img onerror>` and a URL renders as plain text; logout clears
  cached data; http client never sends the token to a URL outside `VITE_API_URL`.
- Responsive and motion: the test matrix above (manual), plus reduced-motion checked once in each screen.
- `npm run build` (type check), `npm run lint` and `npm audit` clean.
- After it works: `/impeccable critique` on the real app (target: clearly above 23/40) and `/impeccable polish`.

## Left to the builder

Exact component props, CSS values within the tokens and scale above, TanStack Query keys, small copy wording within
the meaning given here, test file names, README wording for the Google setup.
