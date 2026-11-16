# Eryysyn frontend design

Date: 2026-11-15
Status: design agreed in brainstorm and reviewed, nothing built yet. Read sections 14 to 17 first: they set priorities and override earlier sections where they differ
Mockups: `docs/superpowers/specs/mockups/` (open the HTML files in a browser)

This document records what the Eryysyn frontend should look like and contain, so the design is not lost while the backend is still being built. It describes screens, layout, themes and what each feature needs before it can work for real.

Lines marked **(my call)** were chosen by Claude during the brainstorm and not explicitly decided by the project owner. They are safe to change.

---

## 1. Why this exists

The backend can already upload, index and search documents, but the frontend is about 420 lines with unfinished placeholders. The next backend step (step 6, answer generation) is not built.

The owner wanted to see the whole product before building more: what screens exist, how they connect, and what future features will look like. The decision was to **design every screen as a hardcoded mockup now** and keep the build order unchanged.

Designing first is cheap, shows where each feature will live, and prevents redesigning the layout every time a feature is added.

## 2. Who it is for

**First user: a college student reviewing course material.** Examples: nursing, dentistry, engineering.

This fills the empty "First user" line in `docs/blueprint.md`.

Reviewing has four jobs, and the design gives each one a home:

| Job | What the student does | Where |
|---|---|---|
| Read | Read the PDF or slides, see figures and tables | Reader |
| Understand | Ask questions, get answers that cite the page | Chat, Reader's Ask panel |
| Remember | Flashcards, quizzes | Study (later) |
| Organize | Keep highlights, notes, bookmarks | Notes, Bookmarks |

Test for any new design choice: **does this help a student review?**

For subjects like nursing a wrong fact is dangerous, so the existing product rule stays central: every answer cites the exact page and the student can check it.

## 3. Goals, non-goals, anti-goals

**Goals**
- One layout that holds all current and planned features without a redesign.
- Three themes, each in light and dark, chosen by the user.
- Works on desktop, tablet and phone.
- Checking a citation is one click away from the answer.
- The user can hide any panel they do not need right now.

**Non-goals (for now)**
- A native phone app.
- Building Reader, Notes, Bookmarks, Study or Voice before step 6 is done.
- Shared workspaces. The layout only keeps a place for them.

**Anti-goals (would make it a failure even if it works)**
- A crowded screen where every feature is visible at once.
- Answers or spoken replies with no way to check the source.
- A layout that needs redesigning when the next feature arrives.
- Marks that alter or damage the original uploaded file.

## 4. Constraints

- Frontend stack today: Vite, React 19, TypeScript, supabase-js. No router and no UI library yet.
- Auth is Supabase. The frontend sends the JWT as a Bearer token.
- Backend endpoints that exist: `GET /workspaces`, `GET` and `POST /workspaces/{id}/documents`, `DELETE /documents/{id}`, `POST /documents/{id}/index`, `POST /workspaces/{id}/search`.
- Uploads are PDF only, up to 20 MB. Document status is `uploaded`, `indexed` or `failed`.
- `frontend/src/Library.tsx` still has three `// YOU:` placeholders (load, upload, delete).
- The chat endpoint (`POST /conversations/{id}/messages`) does not exist yet. It is step 6.
- The project is a learning project. Build order follows the roadmap in `docs/CONTEXT.md`.

## 5. Approaches considered

### When to do the frontend
| Option | Trade-off |
|---|---|
| Keep going with backend, frontend later | Fastest to step 6, but no picture of the product |
| Build only the screens the backend supports | Real, but future features stay invisible |
| **Design everything as hardcoded mockups, build in roadmap order (chosen)** | Cheap, shows the whole product. Risk: scope looks bigger than what is built |

### Theme
Three directions were mocked: Paper (warm, serif), Slate (neutral tool), Sage (soft, calm, modern). The owner liked all three. **Chosen: ship all three and let the user switch, each with light and dark.** Cost accepted: every screen must be checked in six combinations.

### Layout
| Option | Trade-off |
|---|---|
| 1. Sidebar app | Familiar for chat apps, new features are one more sidebar line |
| 2. Workspace notebook (documents, chat, sources in one screen) | Whole loop on one screen, but cramped and no home for chat history |
| 3. Top tabs | Features always visible, but the row runs out of space |

**Chosen: 1 and 3 mixed.** Sidebar holds features. A slim top bar holds things that apply everywhere: workspace switcher, search, theme, account. One idea is borrowed from option 2: the cited page preview sits inside the sources panel.

### Devices
**Chosen: responsive web.** One codebase, runs on any device with a browser. A native app would mean a second codebase. An installable web app (PWA) is a possible middle step later.

### Where marks on a document are stored
| Option | Trade-off |
|---|---|
| **Separate layer saved as rows in the database (chosen)** | Original file untouched, undo works, AI answers use clean text |
| Written into the PDF file | Easy export, but no undo and the original is lost |

## 6. Design principles used

| Principle | How it is applied |
|---|---|
| Jakob's law | Chat looks like known chat apps: sidebar left, messages centre, input at the bottom |
| Fitts's law | Large Ask and Upload buttons. Delete is small and far from common actions. Phone navigation is at the bottom, in thumb reach |
| Hick's law | One primary action per screen |
| Miller's law | Sidebar stays at seven items or fewer |
| Proximity | A citation marker sits directly after the claim it supports |
| Common region | Each source is one card |
| Similarity | All citations look alike, all status badges look alike |
| Von Restorff | Only one accent-coloured button per screen |
| Doherty threshold | Upload and answers show progress immediately |
| Tesler's law | Chunks, embeddings and similar details are never shown to the user |

Visual rules: spacing in multiples of 8px, body text contrast of at least 4.5:1, answer text capped at about 60 characters per line, click targets at least 24px and 44px on phone.

Citation rule from research: people trust citations even when they are wrong and rarely click through. So each source card shows the document name, page number and the **exact excerpt**, not only a title.

## 7. Theme system

Two attributes on the root element select everything:

```html
<html data-theme="sage" data-mode="dark">
```

Every colour, font and corner radius is a CSS variable. Components use the variables and never know which theme is active. The choice is saved in the browser **(my call: localStorage)**. Default theme is Sage **(my call)**, default mode follows the device setting **(my call)**.

### Character per theme
| | Paper | Slate | Sage |
|---|---|---|---|
| Feel | Well-set document | Precise work tool | Calm, soft, modern |
| Heading and answer font | Newsreader (serif) | Inter | DM Sans |
| Interface font | Inter | Inter | DM Sans |
| Corner radius (small / large) | 4 / 6px | 6 / 8px | 12 / 18px |
| Shadows | None | Very light | Soft, wide |
| Citation marker | `[1]` footnote style | Outlined square | Outlined pill |

### Colour tokens
| Token | Paper light | Paper dark | Slate light | Slate dark | Sage light | Sage dark |
|---|---|---|---|---|---|---|
| `--bg` | #F7F3EA | #1A1815 | #F6F7F9 | #0E1013 | #EFF3EE | #121815 |
| `--surface` | #FFFDF8 | #23201C | #FFFFFF | #16191E | #FBFCFA | #1A221E |
| `--side` | #F1ECDF | #161412 | #FBFBFC | #111317 | #E7EDE6 | #0F1512 |
| `--ink` | #1F1B16 | #EDE6D9 | #111827 | #E6E8EC | #1E2A24 | #E3EBE5 |
| `--muted` | #6B6257 | #A89F91 | #5B6472 | #9099A6 | #56655C | #93A39A |
| `--line` | #E0D8C8 | #38332C | #E2E5EA | #262B33 | #D8E1D8 | #2A352F |
| `--accent` | #1F3A5F | #9DB8E0 | #4F46E5 | #8B8CF8 | #3F6B57 | #8FC3A8 |
| `--on-accent` | #FFFFFF | #14202F | #FFFFFF | #0E1013 | #FFFFFF | #10201A |
| `--soft` | #E4EAF2 | #2A3442 | #EEF0FF | #1E2140 | #DCE9E0 | #223129 |
| `--ok` | #2E6B47 | #86C7A0 | #17794A | #5FCB94 | #2F6F4F | #8FC3A8 |
| `--warn` | #8A5A12 | #E0B36A | #92600A | #E3B45F | #85601A | #DDB872 |
| `--err` | #9C2F2F | #E89090 | #B42318 | #F38B80 | #A33B3B | #E69A9A |
| `--hl` (highlight 1) | #F5E3A3 | #5C4E1C | #FDE68A | #5A4A12 | #F3E6A8 | #544A1B |
| `--hl2` (highlight 2) | #CFE3F5 | #27425C | #C7D2FE | #2B2F6B | #CDE6D6 | #234534 |

The owner approved the colours as shown in the mockups. Exact values are **(my call)** and have not been measured with a contrast tool. Measure them when building.

Pen colours are the same in every theme: red #D6453D, blue #2F6FDB, green #1F9D55, amber #E0A100 **(my call)**.

## 8. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ☰ Eryysyn  [Nursing 2A ▾]  ⌕ Search documents…   theme  (G)  │  top bar
├──────────┬─────────────────────────────────┬─────────────────┤
│ Chat     │                                 │ side panel      │
│ Library  │   current page                  │ (only on pages  │
│ Notes    │                                 │  that need it)  │
│ Bookmarks│                                 │                 │
│ Study    │                                 │                 │
│ Voice    │                                 │                 │
│ ──────── │                                 │                 │
│ Continue │                                 │                 │
│ Recent   │                                 │                 │
│ Settings │                                 │                 │
└──────────┴─────────────────────────────────┴─────────────────┘
```

**Top bar:** sidebar toggle, logo, workspace switcher (ready for shared workspaces later), search, theme and light/dark switch, account.

**Sidebar:** Chat, Library, Notes, Bookmarks, Study, Voice. Below: "Continue reading" (last document and page, with progress), recent chats, Settings.

**Pages:** each feature has its own page. Things that serve one task stay on one page. Chat, its history and its sources are one task, so they share a page.

### Screen sizes
| Screen | Layout |
|---|---|
| Desktop | Three columns as drawn |
| Tablet | Sidebar shrinks to icons. Side panels slide in over the page |
| Phone | One column. Sidebar becomes a bottom tab bar. Sources slide up from the bottom |

### Fluid first, breakpoints second

The layout must be fluid: it stretches and shrinks smoothly at every width. It must not be three fixed designs that snap at set sizes.

| Rule | How |
|---|---|
| Sizes flex | Columns use flexible units (`fr`, `minmax()`), not fixed pixel widths. Only the sidebar and side panels have a fixed comfortable width |
| Text and spacing scale smoothly | `clamp(min, preferred, max)` for font sizes and padding, so there are no jumps |
| Reading width is capped | Answers and pages stop growing at about 60 characters per line and centre on very wide screens |
| Lists and card grids reflow on their own | `repeat(auto-fit, minmax(…))` so cards go from 3 to 2 to 1 columns without any breakpoint |
| Components react to their own space | Container queries, not only screen-size queries. Needed because hiding a panel changes the space a page has while the screen stays the same size |
| Breakpoints only for structure | A breakpoint is used only when the arrangement itself must change, for example sidebar becomes bottom tab bar |

The three rows in the table above are the only structural changes. Starting values **(my call)**: about 640px (sidebar becomes bottom tab bar) and about 1024px (side panels stop fitting beside the page and slide over it instead). These come from what fits, not from device names: sidebar 208px + readable page about 480px + side panel about 300px is roughly 1000px. Adjust them when building by resizing the window and watching where the layout starts to look cramped.

Also test: browser zoom at 200%, a phone held sideways, and a very wide monitor.

The mockups are not fluid. They use a fixed width with sideways scrolling, and the phone is drawn as a separate frame. They show arrangement, not resizing behaviour.

### Hiding panels
Every panel has its own hide button, and one Focus button hides everything.

| Control | Where | Hides |
|---|---|---|
| ☰ in top bar | Every page | Sidebar |
| Hide sources | Chat | Sources panel |
| ☰ in reader toolbar | Reader | Contents, slides and bookmarks panel |
| Ask | Reader | Ask and Notes panel |
| Focus | Reader | Top bar, sidebar and both panels. Esc or "Exit focus" restores them |

What the user hides stays hidden on the next visit **(my call: saved in the browser)**. Nothing is hidden by default **(my call)**.

## 9. Pages

Status meanings: **Now** = backend already supports it. **Next** = arrives with step 6. **Later** = needs new backend work, design only for now.

### Login and Register · Now
Email and password through Supabase. The Register screen is missing today and must be added. Not mocked. Follow the theme tokens.

### Library · Now
- Large upload zone: drop a file or choose one.
- Document list: name, status, delete.
- Status badges in plain words **(my call)**: Ready (`indexed`), Preparing… (`uploaded`), Failed · Retry (`failed`). Retry calls `POST /documents/{id}/index`.
- Clicking a name opens the Reader (later).
- The mockup also shows page count and reading progress. Page count needs the documents API to return it. Reading progress is later.

### Search · Now
Search box in the top bar. Results list passages with document name and page number, from `POST /workspaces/{id}/search`. Results page not mocked **(my call: a simple list of result cards using the source card style)**.

### Chat · Next
- Header with chat title and a "Hide sources" button.
- Question bubbles on the right, answers on the left in the reading font.
- Citation markers after each claim. Clicking one highlights its source card.
- Refusal state: "Not found in your documents."
- Under each answer: Save to notes, Make flashcard, thumbs up and down **(my call, all later)**.
- Input at the bottom with "Answer from: All documents" and a "+ Web" option marked later. A microphone button opens Voice.
- Sources panel on the right: numbered cards with document, page, exact excerpt, a preview of the cited page and "Open in reader".

### Reader · Later
Opens a PDF or PowerPoint and shows the real pages, so figures, tables and images appear as in the file.

- Toolbar: panel toggle, document name, Highlight, Pen, Eraser, Note, pen colours, Bookmark, page or slide counter, Ask toggle, Focus.
- Left panel: contents for a PDF or slide thumbnails for PowerPoint, plus this document's bookmarks.
- Centre: the page. Highlights in two colours, pen strokes, numbered pins for typed notes.
- Selecting text shows a small menu: Explain, Ask, Highlight, Note, Flashcard.
- Right panel with two tabs: Ask (chat about this page or selection) and Notes (notes on this page).
- Bookmark button opens a small box asking "What is here?" so each bookmark gets a one-line label.
- Marks are saved on a separate layer. The original file is never changed.
- PowerPoint: converted to PDF on upload, so each slide becomes a page and the same reader works. Citations say "Slide 14".

Known hard parts: pen strokes must stay in place when the page is zoomed or resized, so positions are stored relative to the page. Scanned PDFs have no selectable text, so highlight will not work there, only drawing.

### Notes · Later
Everything the student wrote or marked: highlights, typed notes, drawings (shown as a small picture) and saved answers. Each card links back to its page. Filters by type and by document. Bookmarks are not listed here.

### Bookmarks · Later
All bookmarked pages and slides, grouped by document. Each row: page or slide number, a short title ("About: blood pressure ranges"), a longer line ("This page has the normal cut-offs and figure 12-6"), when it was added, Open, Remove. Search box and sort by document or newest.

Bookmarks appear in two places: this page (all documents) and the Reader's left panel (current document only).

### Study · Later
Flashcards and quizzes made from the student's own documents. Every card and question shows the page it came from. Shows cards due today, review streak and last quiz score. Flashcards have Again, Good and Easy buttons (spaced repetition).

### Voice · Later
For talking instead of reading. A pulsing circle, the state ("Ery is speaking"), and three buttons: mute, pause, end. No text appears during the conversation. The assistant is addressed as "Ery".

Two additions proposed by Claude and **not yet confirmed by the owner**: small chips showing which pages were used ("p. 112"), and saving the conversation to Notes when it ends. Reason: without them a spoken answer cannot be checked, which breaks the product's main promise.

Voice is a layer on top of chat: speech to text, then the same answer pipeline, then text to speech.

### Settings · Now (small)
Theme, light or dark, log out. Not mocked as a page. The theme switch also lives in the top bar.

### How pages connect
- "Open in reader" on a source card opens the Reader at that page.
- A document name in Library opens the Reader.
- "Continue reading" in the sidebar resumes at the last page.
- Page links in Notes, Bookmarks and Study open the Reader at that page.
- The microphone button in Chat opens Voice.

## 10. What each feature needs before it is real

| Feature | Needs |
|---|---|
| Library | Finish the three placeholders in `Library.tsx`. Nothing new on the backend |
| Register | A sign-up screen using Supabase |
| Search | A results screen. Endpoint exists |
| Themes, layout, hide panels | Frontend only |
| Chat | Step 6: generation, citations, conversations and messages |
| Reader (view only) | A way to fetch the original file, and a PDF viewer in the frontend |
| Bookmarks | A table for marks, endpoints to create, list and delete |
| Highlights, typed notes | Same table, plus text positions from the PDF viewer |
| Drawing | Same table, storing stroke points relative to the page |
| Notes page | Listing of the marks table, plus saved answers |
| PowerPoint | Server-side conversion to PDF on upload, and allowing the file type |
| Study | Generating cards and questions with citations, review scheduling |
| Voice | Speech to text, text to speech, wake phrase |
| Web research, shared workspaces | Roadmap phases 6 and later |

Suggested shape for the marks table **(my call, to be designed properly later)**: one table for highlights, notes, drawings and bookmarks with `id`, `workspace_id`, `document_id`, `page`, `type`, `data` (colour, text, position or stroke points) and `created_at`. Every query filters by owner, like the rest of the backend.

## 11. Build order

Agreed: backend order does not change. Step 6 comes first.

Section 14 sets what is in the MVP. Steps 1 to 5 below are the MVP. Steps 6 to 9 are backlog.

Suggested order **(my call)**:
1. Step 6: answer generation with citations (backend).
2. Frontend foundation: theme tokens, layout shell, routing, hide panels.
3. Finish Library, add Register and Search screens.
4. Chat screen wired to step 6.
5. Reader, view only, with "Open in reader" from citations.
6. Bookmarks, then highlights and typed notes, then the Notes page.
7. Drawing.
8. PowerPoint upload.
9. Study, then Voice.

Screens for features that are not built yet can ship as hardcoded previews, or stay out of the sidebar until they work. Decide when building step 2.

## 12. Open questions

- Voice: keep the "pages used" chips and saving the conversation to Notes, or fully blank?
- Should unbuilt features (Study, Voice) be visible in the sidebar with a "later" tag, or hidden until they work?
- Phone tab bar holds five items but there are six features. Which one moves into a "More" menu? Suggestion: Bookmarks, since it is also reachable inside the Reader.
- Routing library, PDF viewer library and the PowerPoint conversion tool are left to whoever builds those steps.
- Keyboard shortcuts were mentioned as useful for students but not designed.

## 13. Mockups

In `docs/superpowers/specs/mockups/`. Open in a browser. They are static HTML with sample nursing content, not connected to the backend.

| File | Shows |
|---|---|
| `01-themes.html` | Paper, Slate and Sage side by side, light and dark |
| `02-layouts.html` | Feature map and the three layout options |
| `03-pages.html` | Final clickable app: every page, theme switch, hide buttons, Focus mode, working pen, phone versions |

`03-pages.html` is the reference for the agreed design. The "Pick" buttons in the first two files only worked during the brainstorm session.

The mockups are a snapshot of 2026-11-15. Once real screens exist, the real app is the reference and the mockups are history.

---

# Additions after design review (2026-11-15)

The design above was reviewed from an engineering point of view. Sections 14 to 17 record what changed. Where they disagree with earlier sections, these win.

## 14. Priorities and the MVP cut line

The design grew from "ask your documents and check the citation" into a full study tool. The project's purpose is to learn RAG, evaluation, agents and production engineering. To protect that, features are ranked, and only the Must group is a plan. The rest is a backlog.

The test from `docs/CONTEXT.md` decides the ranking: *does it help the user get or verify a cited answer?*

| Priority | Feature | Passes the test? |
|---|---|---|
| **Must (MVP)** | Login, Register | Needed to use anything |
| **Must (MVP)** | Library: upload, list, status, retry, delete | Yes, no documents means no answers |
| **Must (MVP)** | Chat with citations and sources panel | Yes, this is the product |
| **Must (MVP)** | Reader, view only, opened from a citation at the right page | Yes, this is the "verify" half |
| **Must (MVP)** | Layout shell, one theme in light and dark, fluid layout | Needed to hold the above |
| Should | Search results page | Helps find, partly overlaps Chat |
| Should | Hide panels, Focus mode | Comfort, cheap once the shell exists |
| Should | Bookmarks | Helps return to a page |
| Should | Highlights, typed notes, Notes page | Helps study, not verification |
| Later | Two more themes | No |
| Later | Drawing | No |
| Later | PowerPoint upload | Widens input, not verification |
| Later | Study (flashcards, quiz) | Only if cards cite pages |
| Later | Voice | No, and makes verification harder |
| Later | Web research, shared workspaces | Roadmap phases 6 and later |

**Cut line: everything below Must waits until the roadmap's Phase 4 (evaluation) is done.** Reason: an answer that looks good in a nice interface but is not measured is the exact failure this project is meant to learn to avoid.

### When is each Must feature done?

| Feature | Done when |
|---|---|
| Register and Login | A new user can sign up, log in, log out. Wrong password shows a clear message |
| Library | Upload shows progress, then the document appears with its status. A failed document can be retried. Delete asks for confirmation. An empty library explains what to do first |
| Chat | A question returns an answer with at least one citation, or the refusal message. Each citation shows document, page and exact excerpt. Loading and error states exist. Past chats can be reopened |
| Reader (view only) | Clicking a citation opens the right document at the right page. Pages load on demand so a 300-page file does not freeze the screen |
| Shell | Works from 320px to very wide screens with no sideways scrolling. Light and dark both pass a contrast check of 4.5:1 for body text. Every control can be reached with the keyboard |

## 15. What the screens need from the backend

Checked against the code on 2026-11-15. These are cheaper to handle while step 6 is being designed than after.

| Screen promise | State of the backend today | What to do |
|---|---|---|
| Source card shows document, page and exact excerpt | Chunks have `page` and `text`. Step 6 does not exist | Step 6 response returns, per citation: number, chunk id, document id, filename, page, excerpt |
| Citation opens the Reader with the passage highlighted | `chunks` stores `page`, `chunk_index`, `text`. No position on the page | For the MVP, open at the page and let the Reader find the excerpt text on it. Storing positions at indexing time is the precise option, but needs a re-index of every document. Decide before many documents exist |
| "Preparing…" status in Library | Upload indexes inside the same request (`index_from_storage` in `api/documents.py`), so the request waits and that state is never seen | Until background jobs exist (Phase 8), show an uploading state in the frontend during the request. Drop the "Preparing…" badge from the MVP |
| Page count column in Library | Document list returns `id`, `filename`, `status`, `created_at` | Add a page count to the documents table at indexing time, or leave the column out of the MVP |
| Answer starts appearing right away | Not decided | Decide streaming or not before fixing the step 6 response shape, since it changes the endpoint |
| Reader shows the original file | Files are in a private bucket | Add an endpoint that checks ownership and returns a short-lived link |
| Past chats in the sidebar | Tables `conversations` and `messages` are planned | Add a list endpoint with step 6 |

Design step 6's API from this table, not the other way round.

## 16. One theme first

Section 7 describes three themes. For the MVP, build the token system as described and ship **one theme (Sage) in light and dark**.

Reason: three themes in two modes is six combinations to check on every screen, for one developer. Because every colour is a token, adding Paper and Slate later is a matter of adding their values, not changing components. The theme switcher in the top bar starts as a light and dark switch only.

## 17. Known gaps, not yet designed

Recorded so they are not forgotten. None of these block step 6.

- **Missing screens:** Login, Register, Search results and Settings have no mockups, even though they are the ones the backend already supports.
- **Missing states:** first visit with an empty library, loading, errors, no search results, a failed answer, very long file names, a library with hundreds of documents.
- **First user not tested:** the student needs in section 2 are assumptions. Show `03-pages.html` to three real students and ask what they would use first and what they would ignore.
- **Accessibility:** contrast not measured. The mockups use emoji as icons, which look different on each device and read badly in screen readers, so use a proper icon set. Keyboard use and focus states are not designed. The pen needs a pointer. Voice with no text needs optional captions.
- **Marks data model:** the single table in section 10 is a sketch. Open points: how a highlight stays attached to its text if extraction changes, whether deleting a document also deletes its notes and bookmarks (ADR-002 suggests yes), and whether the assistant may read the user's notes.
- **Frontend architecture:** routing, data fetching, state, CSS approach, frontend tests (none exist today) and sharing types with the backend are undecided.
- **Security:** how the Reader gets private files, showing model output safely (never as raw HTML), and voice audio leaving the system.
- **Cost:** Explain, flashcards and voice all call paid models. No limits are designed.
- **Trust wording:** for medical subjects, the interface should tell the student to check the cited page.
- **Decision records:** theme tokens, the mixed layout and the separate marks layer are decisions in the style of the existing ADRs and could be added to `docs/blueprint.md` as ADR-005 to 007.
