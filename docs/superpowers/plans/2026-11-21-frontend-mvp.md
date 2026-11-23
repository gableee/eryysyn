# Frontend MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student can sign up, upload PDFs, ask questions and check each cited excerpt in the browser, on any screen size, with every state designed.

**Architecture:** Feature folders (`features/auth|library|chat`) on a shared base (`shared/http`, `shared/ui`, `styles/tokens.css`). Pages compose components; only each feature's `api.ts` knows backend URLs, through `shared/http`. Each feature is built "look first" (components with sample data, visible on `/dev/states`), then wired with TanStack Query.

**Tech Stack:** Vite, React 19, TypeScript, React Router 7 (`react-router`), TanStack Query 5, CSS Modules, lucide-react, Motion (`motion/react`), `@fontsource/dm-sans`, supabase-js 2, Vitest + React Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-21-frontend-mvp-design.md` (also `PRODUCT.md`, and the 2026-11-15 design for Sage token values)

## Global Constraints

- All work in `frontend/`. No backend changes. Commands from `frontend/`: `npm test` (= `vitest run`), `npm run build`, `npm run lint`.
- Commits need the user's OK (CLAUDE.local.md): each "Commit" step = show files + message, ask "commit?". No Co-Authored-By lines.
- Components never call `fetch` or contain backend URLs; only `features/*/api.ts` calls `shared/http`. Features never import each other.
- Model output, file names and excerpts are rendered as text only. Never `dangerouslySetInnerHTML`; URLs in answers are not links.
- Only features that work appear: no Reader, Search, Notes, Study, Voice, theme picker, workspace switcher, "+ Web", mic, LATER badges.
- WCAG 2.2 AA: real `<button>`/`<a>`, visible focus (`--focus`, 2px), labels on every icon, one `h1` per page, 44px touch targets below 600px, text ≥ 4.5:1, control borders ≥ 3:1, both modes.
- Type scale rem-based: 12 / 14 / 16 / 19 / 23 px; nothing under 12px; body 16px; answer max 65ch; sentence-case labels.
- No side-stripe borders, no card inside a card, no thin-border + wide-shadow cards.
- Motion: `transform`/`opacity` only, 150-300 ms, curve `cubic-bezier(0.22, 1, 0.36, 1)`; `prefers-reduced-motion: reduce` → instant or 150 ms fade.
- Width zones (main area): < 600 one column + bottom tabs + sources under answers; 600-960 icon sidebar + sources under answers; ≥ 960 full sidebar, sources panel beside when the chat container ≥ 820px; ≥ 1600 centred. Height < 500: compact bar, no bottom tabs. `dvh` + `env(safe-area-inset-*)`, `viewport-fit=cover`.
- Exact copy: "Your documents. Only you can see them." · "Only PDF files for now." · "This file is over 20 MB." · "Uploading and reading… this can take a minute" · "Couldn't read it" · "Try again" · "Ask a question about your documents." · "Upload a PDF first" · "Ery is reading your documents…" · "Still working. Local models can take up to ~15 s." · "Not found in your documents." · "Try other words, or check the document is in your Library." · "Ery can't answer right now. The model isn't running." · "This chat no longer exists" · "Check the cited page before relying on an answer." · "Source removed" · "Searched for: " · "Untitled chat" · "We sent a link to {email}. Open it, then log in." · "Wrong email or password" · "Can't reach the server".
- Env: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, new optional `VITE_AUTH_GOOGLE` ("true" shows the Google button).
- Upload limit 20 MB (`20 * 1024 * 1024`, same as backend `MAX_BYTES`).

## Review Focus

1. The session expires mid-use (any call returns 401) → the user lands on `/login`, the query cache is empty, no flash of the previous data. Test: Task 4 `signing out by a 401 clears cached data and redirects to login`.
2. Ask pressed twice (Enter + click, or double Enter) while an answer is pending → exactly one request. Test: Task 9 `sending twice while pending makes one request`.
3. Leaving the chat while an answer is pending, then coming back → the answer is there (written into the query cache), no lost question. Test: Task 9 `an answer that arrives after navigating away is shown on return`.
4. A second file chosen while one is uploading → refused politely, one upload at a time. Test: Task 7 `upload zone is disabled while a file uploads`.
5. Very long file names, excerpts and unbroken strings (URLs, hashes) → wrap inside their box, no sideways scroll at 320px. Test: Task 11 manual matrix row "long text at 320px", plus `overflow-wrap: anywhere` asserted in Task 1's base CSS test.

---

### Task 1: Foundation — tooling, tokens, base styles

**Files:**
- Modify: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`
- Create: `frontend/src/styles/tokens.css`, `frontend/src/styles/base.css`, `frontend/src/test/setup.ts`, `frontend/src/styles/tokens.test.ts`
- Delete: `frontend/src/App.css`, `frontend/src/index.css`, `frontend/src/assets/*` (template), `frontend/public/vite.svg` if unused

**Interfaces:**
- Produces: CSS variables on `html[data-mode="light"|"dark"]`: `--bg --surface --side --ink --muted --line --line-strong --accent --on-accent --soft --ok --warn --err --hl --focus`, `--font`, `--ease: cubic-bezier(0.22,1,0.36,1)`, type sizes `--t-12 --t-14 --t-16 --t-19 --t-23` (rem). `npm test` runs Vitest with jsdom and jest-dom.

- [ ] **Step 1: Install** — deps: `react-router @tanstack/react-query lucide-react motion @fontsource/dm-sans`; dev: `vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`. Add `"test": "vitest run"`; Vitest config in `vite.config.ts` (`environment: "jsdom"`, `setupFiles: "src/test/setup.ts"`, `css: { modules: { classNameStrategy: "non-scoped" } }`).
- [ ] **Step 2: Write the failing test** `src/styles/tokens.test.ts`: parse `tokens.css` (read the file as text, extract hex values per mode) and assert, for light and dark: `contrast(--ink, --surface) >= 4.5`, `contrast(--muted, --surface) >= 4.5`, `contrast(--muted, --bg) >= 4.5`, `contrast(--on-accent, --accent) >= 4.5`, `contrast(--line-strong, --surface) >= 3`, `contrast(--focus, --bg) >= 3`; and that `base.css` contains `overflow-wrap: anywhere` and `prefers-reduced-motion`.
- [ ] **Step 3: Run** `npm test` → FAIL (files missing).
- [ ] **Step 4: Write `tokens.css`** with the Sage light/dark values from the 2026-11-15 design (section 7), adding `--line-strong` and `--focus` chosen to pass the test; `base.css`: reset, DM Sans import, rem scale, body 16px, `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`, `overflow-wrap: anywhere` on text containers, reduced-motion block. `index.html`: `lang="en"`, `viewport-fit=cover`, title "Eryysyn". `main.tsx` imports the two CSS files and a placeholder `<App/>`.
- [ ] **Step 5: Run** `npm test` → PASS; `npm run build` → succeeds.
- [ ] **Step 6: Ask "commit?"** — `feat(frontend): tooling, Sage tokens with tested contrast, base styles`

---

### Task 2: Shared HTTP client and workspace

**Files:**
- Create: `frontend/src/shared/supabase.ts` (moved from `lib/`, with `auth: { flowType: "pkce" }`), `frontend/src/shared/http.ts`, `frontend/src/shared/workspace.ts`, `frontend/src/shared/http.test.ts`
- Delete: `frontend/src/lib/`

**Interfaces:**
- Produces:
  - `type ApiErrorKind = "unauthorized" | "not_found" | "too_large" | "unsupported" | "invalid" | "unavailable" | "network" | "server"`
  - `class ApiError extends Error { kind: ApiErrorKind; status: number | null }`
  - `http<T>(path: string, init?: RequestInit): Promise<T>` — `path` must start with `/` (else throws `TypeError`); prefixes `VITE_API_URL`; adds `Authorization: Bearer <token>`; 204 → `null`
  - `setUnauthorizedHandler(fn: () => void): void` — called on 401
  - `useWorkspaceId(): { workspaceId: string | undefined; isLoading: boolean; error: ApiError | null }` — `useQuery(["workspaces"])`, first item's `id`

- [ ] **Step 1: Failing tests** (fake `fetch`, mocked `shared/supabase` session token "tok"):
  - `adds the bearer token and the API base url`
  - `refuses a path that is not relative` (`http("https://evil.example/x")` throws, fetch not called)
  - status mapping: 401 → `unauthorized` and the handler is called once; 404 `not_found`; 413 `too_large`; 415 `unsupported`; 422 `invalid`; 502 and 503 `unavailable`; 500 `server`; fetch rejects → `network`
  - `204 returns null`
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Ask "commit?"** — `feat(frontend): shared http client with typed errors, PKCE supabase client`

---

### Task 3: Shared UI kit

**Files:**
- Create in `frontend/src/shared/ui/`: `Button.tsx`, `IconButton.tsx`, `TextField.tsx`, `InlineConfirm.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `BreathingDot.tsx`, `VisuallyHidden.tsx`, each with `.module.css`; `ui.test.tsx`

**Interfaces:**
- Produces:
  - `Button({ variant: "primary" | "secondary" | "quiet" | "danger", busy?, ...buttonProps })` — `busy` sets `aria-busy` and disables
  - `IconButton({ label: string, icon: LucideIcon, ...buttonProps })` — `aria-label={label}`, 44px min target below 600px
  - `TextField({ label, hint?, error?, ...inputProps })` — `<label>`, `aria-describedby` for hint/error, `aria-invalid` when error
  - `InlineConfirm({ question, confirmLabel, onConfirm, onCancel })` — focuses the cancel button on mount; Esc cancels
  - `EmptyState({ title, body?, action? })`, `ErrorState({ message, onRetry? })` (`role="alert"`), `BreathingDot()` (`aria-hidden`), `VisuallyHidden`

- [ ] **Step 1: Failing tests:** `icon button exposes its label`; `text field links its error to the input` (`toHaveAccessibleDescription`); `busy button is disabled and aria-busy`; `inline confirm calls onConfirm, and Escape calls onCancel`; `error state is announced and retry calls back`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (press-down `scale(0.97)` on `:active`, transition on `--ease`; none under reduced motion). **Step 4: Run** → PASS.
- [ ] **Step 5: Ask "commit?"** — `feat(frontend): accessible shared UI kit`

---

### Task 4: Auth — session, Login, Register, Check inbox, Google

**Files:**
- Create in `frontend/src/features/auth/`: `useSession.tsx` (`SessionProvider`, `useSession`), `LoginPage.tsx`, `RegisterPage.tsx`, `CheckInboxPage.tsx`, `GoogleButton.tsx`, `.module.css` files, `auth.test.tsx`
- Delete: `frontend/src/Login.tsx`

**Interfaces:**
- Consumes: `shared/supabase`, `setUnauthorizedHandler` (Task 2), UI kit (Task 3)
- Produces: `SessionProvider` (wraps the app; on sign-out or user id change calls `queryClient.clear()`; registers the 401 handler = `supabase.auth.signOut()`); `useSession(): { session: Session | null; loading: boolean }`

- [ ] **Step 1: Failing tests** (mock `supabase.auth`):
  - `login shows "Wrong email or password" on invalid credentials`; `login shows "Can't reach the server" when the request fails`
  - `register with a returned session goes to /library`; `register without a session goes to /check-inbox and shows the email`; `register with an existing email links to login`
  - `google button only renders when VITE_AUTH_GOOGLE is "true"`; it calls `signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })`
  - `signing out by a 401 clears cached data and redirects to login` (seed the QueryClient, trigger the handler, assert cache empty)
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (password show/hide toggle; min-length hint "At least 6 characters"). **Step 4: Run** → PASS.
- [ ] **Step 5: Ask "commit?"** — `feat(frontend): login, register (both confirm modes), Google button, session clears cache`

---

### Task 5: App shell, routes, theme, dev states page

**Files:**
- Create in `frontend/src/app/`: `App.tsx` (QueryClientProvider, SessionProvider, RouterProvider), `routes.tsx`, `AppShell.tsx` (+ `.module.css`), `MobileDrawer.tsx`, `DevStates.tsx`, `shell.test.tsx`; `frontend/src/shared/theme.ts`
- Modify: `frontend/src/main.tsx`; Delete: `frontend/src/App.tsx` (old)

**Interfaces:**
- Consumes: `useSession` (Task 4)
- Produces: route table per the spec (`/login /register /check-inbox /library /chat /chat/:id / /dev/states`); `RequireAuth` / `RequireGuest` guards; `useTheme(): { mode: "light" | "dark"; toggle(): void }` (default from `prefers-color-scheme`, saved under `localStorage["eryysyn.mode"]` with try/catch, sets `html[data-mode]`); `AppShell` slots: `sidebarExtra?: ReactNode` (Task 9 puts Recent chats there); `DevStates` registry `registerStates(name: string, render: () => ReactNode)` used by Tasks 6 and 8

- [ ] **Step 1: Failing tests:** `signed-out user visiting /library is sent to /login`; `signed-in user visiting /login is sent to /`; `theme toggle switches data-mode and remembers it`; `theme survives localStorage throwing`; `navigation shows only Chat and Library` (no Notes/Study/Voice text); `/dev/states is not routed in production` (`import.meta.env.DEV=false`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the shell to the width zones in Global Constraints with a container query on the main area; bottom tabs below 600px; height < 500px hides bottom tabs and shows the menu button; sidebar drawer below 960px uses Motion (spring, no overshoot: `{ type: "spring", bounce: 0, duration: 0.3 }`), backdrop fade; page links use React Router `viewTransition`. **Step 4: Run** → PASS; `npm run build` OK.
- [ ] **Step 5: Ask "commit?"** — `feat(frontend): app shell, guarded routes, light/dark, responsive zones, dev states page`

---

### Task 6: Library — look (components with sample data)

**Files:**
- Create in `frontend/src/features/library/`: `types.ts`, `UploadZone.tsx`, `DocumentRow.tsx`, `EmptyLibrary.tsx`, `validateFile.ts`, `.module.css` files, `library.ui.test.tsx`, `library.states.tsx` (registers states on `/dev/states`)

**Interfaces:**
- Produces:
  - `type DocumentStatus = "uploaded" | "indexed" | "failed"`; `interface LibraryDocument { id: string; filename: string; status: DocumentStatus; created_at: string }`
  - `validateFile(file: File): string | null` — returns "Only PDF files for now." (type not `application/pdf` and name not ending `.pdf`), "This file is over 20 MB." (> 20 MB), else null
  - `UploadZone({ onFile(file: File), disabled: boolean, error?: string })` — drag-and-drop + "Choose a file" button; shows "PDF · up to 20 MB"
  - `DocumentRow({ doc: LibraryDocument | { filename: string; status: "uploading" }, onRetry?(), onDelete?() })` — statuses: uploading ("Uploading and reading… this can take a minute"), indexed (icon + "Ready"), failed (icon + "Couldn't read it" + "Try again"); Delete opens InlineConfirm
  - `EmptyLibrary()` — "Your documents. Only you can see them." context, upload zone as the only action, "After uploading, ask questions in Chat."

- [ ] **Step 1: Failing tests:** `validateFile` (pdf ok, `.png` refused, 21 MB refused, `application/pdf` with `.PDF` ok); `ready row shows icon and text, not colour only`; `failed row offers Try again`; `delete asks before deleting` (onDelete only after confirm); `uploading row shows the long-wait text`; `a very long file name is in the row` (text present, no truncation without a title attribute).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; register every state in `library.states.tsx`. **Step 4: Run** → PASS; open `/dev/states` and look at each state in light and dark.
- [ ] **Step 5: Ask "commit?"** — `feat(frontend): library components and states (sample data)`

---

### Task 7: Library — wire to the API

**Files:**
- Create in `frontend/src/features/library/`: `api.ts`, `hooks.ts`, `LibraryPage.tsx` (+ `.module.css`), `library.page.test.tsx`
- Delete: `frontend/src/Library.tsx`

**Interfaces:**
- Consumes: `http`, `useWorkspaceId` (Task 2); Task 6 components
- Produces: `listDocuments(ws): Promise<LibraryDocument[]>`, `uploadDocument(ws, file): Promise<{ id; filename; status }>` (multipart, field `file`, no Content-Type header), `retryDocument(id): Promise<{ id; status }>`, `deleteDocument(id): Promise<null>`; hooks `useDocuments()`, `useUpload()`, `useRetry()`, `useDelete()` (each invalidates `["documents", ws]`); query key `["documents", workspaceId]` (Task 9 reads it for the "Upload a PDF first" check)

- [ ] **Step 1: Failing tests** (mock `api.ts`):
  - `empty list shows the first-visit state`
  - `choosing a pdf shows the uploading row, then the ready row`
  - `upload zone is disabled while a file uploads`
  - `a 413 from the server shows "This file is over 20 MB."`; `a 415 shows "Only PDF files for now."`
  - `Try again calls retry and shows the new status`
  - `deleting removes the row after confirm`
  - `a list error shows ErrorState and Retry refetches`
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (list items animate to new positions with Motion `layout`, none under reduced motion; results announced via `aria-live="polite"`). **Step 4: Run** → PASS.
- [ ] **Step 5: Ask "commit?"** — `feat(frontend): library wired to the API (upload, retry, delete)`

---

### Task 8: Chat — look (components with sample data)

**Files:**
- Create in `frontend/src/features/chat/`: `types.ts`, `parseCitations.ts`, `searchedFor.ts`, `CitationMarker.tsx`, `AnswerMessage.tsx`, `UserMessage.tsx`, `PendingAnswer.tsx`, `SourceCard.tsx`, `SourcesPanel.tsx`, `Composer.tsx`, `.module.css` files, `chat.ui.test.tsx`, `parseCitations.test.ts`, `chat.states.tsx`

**Interfaces:**
- Produces:
  - `interface Citation { n: number; chunk_id: string | null; document_id: string | null; filename: string; page: number; excerpt: string }`
  - `interface ChatMessage { id: string; role: "user" | "assistant"; content: string; refused: boolean; created_at: string; search_question: string | null; citations: Citation[] }`
  - `interface ConversationSummary { id: string; title: string | null; created_at: string }`; `interface ConversationDetail extends ConversationSummary { instructions: string; messages: ChatMessage[] }`
  - `interface SendResult { message_id: string; answer: string; refused: boolean; search_question: string; citations: Citation[] }`
  - `type Segment = { kind: "text"; text: string } | { kind: "cite"; n: number }`; `parseCitations(text: string, known: number[]): Segment[][]` — paragraphs split on blank lines; `[n]` with `n` in `known` → cite; anything else stays text
  - `showSearchedFor(typed: string, searched: string | null): boolean` — false when null or equal after lowercasing, collapsing whitespace and dropping trailing `?.!`
  - `CitationMarker({ citation: Citation, active: boolean, onSelect() })` — accessible name `Source {n}, {filename} page {page}`
  - `AnswerMessage({ message: ChatMessage, onSelectCitation(n: number) , activeN?: number })` — the word before each marker and the marker sit in one `white-space: nowrap` span; refused → "Not found in your documents." + "Try other words, or check the document is in your Library."
  - `UserMessage({ text, searchQuestion })` — "Searched for: …" only when `showSearchedFor`
  - `PendingAnswer()` — BreathingDot + "Ery is reading your documents…"; after 5000 ms adds "Still working. Local models can take up to ~15 s."; `aria-live="polite"`
  - `SourceCard({ citation, active })` — number, filename, "p. {page}", excerpt in a tinted quote block (no side stripe); `document_id === null` → "Source removed"
  - `SourcesPanel({ citations, activeN, layout: "panel" | "inline" })` — always starts with "Check the cited page before relying on an answer."; inline = "Sources ({n})" disclosure, open by default; scrolls the active card into view
  - `Composer({ onSend(text: string), disabled: boolean, initialText?: string })` — Enter sends, Shift+Enter newline, empty or whitespace never sends, max 1000 chars (backend limit) with a counter near the limit

- [ ] **Step 1: Failing tests:**
  - `parseCitations`: `"A [1]. B [2]."` with known [1,2] → text/cite/text/cite/text; `[9]` unknown stays text; a marker counts only when it follows the start, whitespace or punctuation, so `items[1]` stays text; blank lines split paragraphs
  - XSS: an answer `"<script>alert(1)</script> <img src=x onerror=alert(1)> see https://free-grades.example.com [1]"` renders those as visible text, `container.querySelector("script, img, a")` is null
  - `citation marker never wraps alone` (marker and preceding word share a nowrap span)
  - `citation marker has an accessible name with file and page`
  - `searched for appears only when different`; `showSearchedFor` cases (null, same with different case/space/`?`, different)
  - `refusal shows the next step`
  - `pending answer adds the still-working line after 5 s` (fake timers)
  - `source card shows Source removed when the document is gone`
  - `sources panel always shows the check-the-page notice`
  - `composer sends on Enter, not on Shift+Enter, never sends blank`
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; register states (answer with 2 sources, refusal, disagreement answer with two sources, pending, still working, model unavailable, source removed, long excerpt) in `chat.states.tsx`. **Step 4: Run** → PASS; review `/dev/states` light and dark.
- [ ] **Step 5: Ask "commit?"** — `feat(frontend): chat components and states, safe citation rendering (sample data)`

---

### Task 9: Chat — wire to the API

**Files:**
- Create in `frontend/src/features/chat/`: `api.ts`, `hooks.ts`, `ChatPage.tsx`, `ChatList.tsx`, `MessageList.tsx`, `.module.css` files, `chat.page.test.tsx`
- Modify: `frontend/src/app/routes.tsx` (`/chat`, `/chat/:id`, `/` redirect), `AppShell` `sidebarExtra` → `ChatList`

**Interfaces:**
- Consumes: Task 8 components and types; `http`, `useWorkspaceId`; `["documents", ws]` (Task 7)
- Produces: `listConversations(ws): Promise<ConversationSummary[]>`, `getConversation(id): Promise<ConversationDetail>`, `createConversation(ws): Promise<ConversationSummary>`, `sendMessage(id, question): Promise<SendResult>`; hooks `useConversations()`, `useConversation(id)`, `useSend()` (writes the user message + answer into `["conversation", id]` and invalidates `["conversations", ws]` on success, whether or not the page is still mounted)

- [ ] **Step 1: Failing tests** (mock `api.ts`, MemoryRouter):
  - `new chat with an empty library shows Upload a PDF first with a link to Library`
  - `first question creates the chat, sends it and moves to /chat/:id`
  - `the question shows at once with the pending state and Ask disabled`
  - `sending twice while pending makes one request`
  - `answer arrives with markers; clicking a marker activates its source card`
  - `the panel shows the newest answer's sources; clicking a marker in an older answer switches it`
  - `a 502 shows the model-unavailable error and Retry resends the same text`
  - `if the first message fails after the chat was created, the error and Retry stay on /chat/:id`
  - `a 404 chat shows This chat no longer exists with New chat`
  - `reopening a chat shows its messages, citations and Searched for lines`
  - `an answer that arrives after navigating away is shown on return`
  - `recent chats list titles newest first, "Untitled chat" for null, current one marked (aria-current)`
  - `/ redirects to /library when the library is empty, else to /chat`
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (messages animate in from the composer; sources panel cross-fades; `layout` "panel" when the chat container ≥ 820px, else "inline"). **Step 4: Run** → PASS.
- [ ] **Step 5: Ask "commit?"** — `feat(frontend): chat wired to the API (new chat, follow-ups, sources, errors)`

---

### Task 10: Security headers, deploy config, README

**Files:**
- Create: `frontend/vercel.json`, `frontend/csp.ts` (policy builder), `frontend/src/security.test.ts`
- Modify: `frontend/vite.config.ts` (plugin), `frontend/README.md` (env vars, Google setup), `frontend/.env.example` (all four vars, no values)

**Interfaces:**
- Produces: `buildCsp(apiUrl: string, supabaseUrl: string): string` → `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' {apiUrl} {supabaseUrl}; base-uri 'self'; form-action 'self'`; a Vite plugin (`apply: "build"`) inserting `<meta http-equiv="Content-Security-Policy" content=…>` via `transformIndexHtml`

- [ ] **Step 1: Failing tests:** `buildCsp` contains `script-src 'self'` and only the two given origins in `connect-src`; `vercel.json` has the rewrite `{ "source": "/(.*)", "destination": "/index.html" }` and headers `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`; `the dev server config does not add the CSP` (plugin `apply === "build"`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; README: Google setup steps (Google Cloud OAuth client, Supabase → Authentication → Providers → Google, redirect URLs `http://localhost:5173` and later the Vercel domain), "Confirm email" works on or off. **Step 4: Run** → PASS; `npm run build && npm run preview`: app loads and talks to the API (no CSP errors in the console); `npm audit` → 0 high/critical.
- [ ] **Step 5: Ask "commit?"** — `feat(frontend): build-time CSP, Vercel rewrite and security headers, setup docs`

---

### Task 11: End-to-end check, responsive matrix, critique, docs

**Files:**
- Create: `docs/experiments/2026-11-2x-frontend-mvp.md` (checklist results, screenshots list, critique score before/after)
- Modify: `docs/CONTEXT.md` (Phase 3 item ticked, progress line, roadmap row stays "In progress" until the Reader is decided)

- [ ] **Step 1: Run the real stack** (backend `uvicorn`, Ollama, `npm run dev`) and walk the checklist: register (confirm on and off), login, Google (if configured), upload a PDF → Ready, upload a PNG → refused, ask → answer + excerpt, follow-up → "Searched for", click a marker, reload `/chat/:id` keeps the chat, stop Ollama → model-unavailable state → start → Retry works, delete a cited document → reopen chat → "Source removed", log out → back button shows no data.
- [ ] **Step 2: Responsive matrix** (browser window / devtools): 320, 375, 414, 480, 600, 768, 1024, 1280, 1440, 1920, 2560 wide; 844×390 landscape; 1080×1920 vertical; 50% and 33% split; zoom 200%; long text at 320px; light + dark; reduced motion on. Note any failure and fix it test-first before continuing.
- [ ] **Step 3: Keyboard-only run** from login to checking a source; screen reader spot check (focus order, announcements).
- [ ] **Step 4: `/impeccable critique`** on the running app (Chat, Library, shell); target clearly above 23/40; then `/impeccable polish` for what it lists.
- [ ] **Step 5: Write the record and CONTEXT**, full `npm test`, `npm run build`, `npm run lint`.
- [ ] **Step 6: Ask "commit?"** — `docs: frontend MVP checked end to end, responsive matrix, critique before/after`
