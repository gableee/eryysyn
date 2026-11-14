# Eryysyn Engineering Notes

Learning notebook + handoff file. Update it after every step. Rule: if I cannot explain a section in my own words, I do not understand it yet.

## 1. What Eryysyn is

A multi-user platform where people put documents into private workspaces and an AI answers questions based on those documents, with page-level citations they can verify.

Different from ChatGPT: answers are grounded in my documents, carry exact page citations, and the system refuses when the documents don't support a claim.

Core loop: a user uploads documents, then asks a question, so they get an answer that cites the exact page, which they can check against the original.

Feature test: does it help the user get or verify a cited answer? Yes = near the MVP. No = it can wait.

## 2. The pipeline

```
INGEST
 upload PDF -> validate -> save original to storage + documents row
   -> extract text per page -> clean -> chunk (within a page)
   -> embed each chunk -> store chunks + vectors + page

ASK
 question -> auth + workspace check -> embed question (with query prefix)
   -> vector search filtered by workspace -> top-k chunks WITH page numbers
   -> prompt (question + chunks + grounding rule) -> LLM -> answer + citations
```

Every arrow is a place where quality can be lost. When an answer is bad, find which stage failed: extraction, chunking, embedding, retrieval, or generation.

Where "page 55" comes from: extraction returns text per page, and we attach the page number at that moment. Chunks inherit it and it is stored next to the vector. The LLM never invents it. The database hands it back.

Grounding rule: the LLM answers only from retrieved passages and says "not found in your documents" when they don't contain the answer. Refusals return `citations: []`.

## 3. Architecture

Browser (React) -> Backend (FastAPI) -> Postgres + pgvector, file storage (private bucket), embedding model, LLM API.

- Why a backend: keys and authorization cannot live in the browser. Anything the browser holds can be read or changed by the user.
- Why Postgres + pgvector: permissions are relational, and keeping vectors in the same database lets one query filter by access and search by similarity.
- Why originals live in file storage: big files make tables heavy and expensive. The row keeps a `storage_path` pointer. The original is the source of truth and chunks can be rebuilt from it.
- Modular monolith: one app with clear folders (`api/`, `services/`, `rag/`, `llm/`, `db/`, `core/`). `api/` stays thin (HTTP only), `rag/` knows nothing about FastAPI.
- Backend is the authorization source of truth for now. It connects as the DB owner, which bypasses RLS, so every query must filter by owner. RLS comes in Phase 4 as a second layer.

## 4. Decisions (ADRs)

| ADR | Decision | Reason | Cost accepted |
|-----|----------|--------|---------------|
| 001 | Every user gets a personal workspace. Documents belong to workspaces. Sharing later = duplicate workspace + invite members | Private by default, sharing needs no redesign | One extra table and join now |
| 002 | Deleting a document hard-deletes the file, chunks, vectors | Users must be able to truly delete their data | No undo |
| 003 | Citations stay after deletion with a "source removed" marker (nullable chunk_id, ON DELETE SET NULL, snapshot of title and page) | Old answers stay honest | Slight data duplication |
| 004 | Chunks are built page by page, never across a page break | Each chunk has one exact page, so citations are precise | Ideas crossing a page break are split (reducible later with boundary overlap) |

Other decisions: sync indexing first and background workers later (feel the pain first), hard-coded 20 MB upload limit, 404 instead of 403 for resources you don't own, plain SQL with psycopg (no ORM) so nothing is magic.

## 5. Database schema

Tables: workspaces, documents, chunks, conversations, messages, message_citations (+ Supabase auth.users).

chunks: id, document_id (FK, cascade), workspace_id, page, chunk_index, text, embedding vector(384), embedding_model, created_at. HNSW index on embedding with cosine ops.

Trade-offs to remember:
- workspace_id on chunks = faster filtering and simpler RLS, but a duplicated fact. If a document ever moved workspaces, chunks must be updated too.
- Store structured facts in columns, not inside text (citations are a table, not text in content).
- UUID ids are not guessable.
- embedding_model on every row, since vectors from different models can't be compared and re-embedding must be possible.

## 6. API contracts

| Endpoint | Success | Errors |
|----------|---------|--------|
| POST /workspaces/{id}/documents | 201 | 401, 404 (not yours), 413 too large, 415 not PDF |
| GET /workspaces/{id}/documents | 200 | 401 |
| DELETE /documents/{id} | 204 | 401, 404 |
| GET /workspaces | 200 (creates Personal on first visit) | 401 |
| POST /conversations/{id}/messages | 201, assistant message + citations[] | 401, 403, 404, 422 |

Method meanings: GET read, POST create, PUT replace, PATCH partial change, DELETE remove. The client never sends user_id. It comes only from the verified JWT.

## 7. Auth (how it works)

Supabase Auth issues a signed JWT. The frontend sends `Authorization: Bearer <token>`. The backend verifies the signature using Supabase's public keys (JWKS), and the `sub` claim is the user id. `Depends(get_current_user_id)` runs this before any route that lists it. A route without it is public, so forgetting it is a security bug.

## 8. RAG concepts

**Extraction.** A PDF is drawing instructions, not text. Extractors rebuild text from glyph positions. Known failures: two-column mixing, headers and footers in the body, hyphenated line ends, tables and formulas jumbled, scanned PDFs (no text, need OCR). PDF page index differs from the printed page number, and we cite the index.

Observed on my real PDF:
- Hard line breaks mid-sentence, so `clean_text` joins lone newlines.
- pages[10] (page 11): no repeated header/footer. Page starts and ends mid-sentence (fine under ADR-004).
- **Fixed (was a bug):** pymupdf also emits a single `\n` between paragraphs and headings, so the current `clean_text` fuses them ("...exist. The idea... Responsibilities to Employers Most computing..."). Paragraph breaks are NOT kept yet. Fix before chunking (e.g. `page.get_text("blocks")`, or keep a break after short lines ending in `.`/`:`).

**Chunking.** The chunk is the unit that is found, sent to the LLM, and cited.
- Too small: fragments, split answers. Too large: diluted vector, noisy and costly prompts, vague citations.
- Hard limit: the embedding model silently drops text beyond its max tokens (512 for bge-small), so target about 200-300 tokens.
- Overlap keeps answers that sit on a boundary findable.
- Two separate limits: the embedding model's max tokens (caps chunk size) and the LLM context window (caps how many chunks we send).
- Planned signature: `chunk_pages(pages: list[tuple[int, str]], max_tokens=250, overlap=40) -> list[Chunk]`; `Chunk` = page, chunk_index (0-based per document), text.

**Embeddings.** Text -> tokens -> transformer (attention) -> pooled -> normalized into one fixed-length vector. Similar meanings end up close because of contrastive training on huge numbers of text pairs. Individual numbers mean nothing. Similarity = cosine (for normalized vectors, a dot product). The same model must embed chunks and questions.

Measured by me in scratch.py:
- Embeddings match topic, not truth. "Safe" vs "not safe" scored about 0.88-0.91. Retrieval returns candidates, not proof. This is why citations and verification matter, especially for medical material.
- Raw scores are not comparable across models (bge's unrelated sentences sat at 0.26-0.44, MiniLM's near 0). Rank and gap matter. Never pick a refusal threshold without measuring.
- One question proves nothing, so we need an evaluation set.
- bge needs a query prefix. Skipping it silently lowers quality.

**Vector search.** Exact search compares against every vector. HNSW is a layered neighbor graph: fast but approximate (accuracy vs speed trade-off).

**Model choice.** Started with bge-small-en-v1.5 (384 dims, 512 tokens). Compare with all-MiniLM-L6-v2 using a real evaluation set. Criteria: language, max tokens vs chunk size, hardware, vector size, privacy, license, then measure on my own documents (MTEB retrieval score only as a shortlist). GPU (RTX 5060, cuda:0) is used automatically, but code must also work on CPU.

**Retrieval findings (real PDF, k=4, bge-small):**
- "What is a conflict of interest?" -> p11 first (0.774), next 0.636: clear gap.
- "Why should developers tell customers about risks?" -> p10 (0.741) then p11 (0.709): both relevant, small gap. The best passage was ranked 2nd, so retrieval gives candidates and the LLM/citations must handle it.
- Off-topic "bake a chocolate cake" -> best 0.431, the rest ~0.36. Clearly lower than on-topic (0.64-0.77), but the tiny chunk "1. Introduction" ranked first: tiny chunks are noise. Revisit with the eval set. Pick a refusal threshold only after measuring.

## 9. Roadmap and where I am

| Phase | Subject | Status |
|-------|---------|--------|
| 0 | Product and architecture | Done |
| 1 | Full-stack foundation | Done enough for MVP (missing register screen, RLS postponed) |
| 2 | LLM integration | Skipped on purpose, learned inside RAG flow |
| 3 | RAG from scratch | In progress |
| 4 | Evaluation, reliability, trust | Not started |
| 5 | LangChain (optional, compare) | Not started |
| 6 | External web research | Not started |
| 7 | LangGraph and agents | Not started |
| 8 | Production and MLOps | Not started |

Phase 3 progress: extraction works (21 pages from a real PDF). Next: fix clean_text, chunker, embeddings, chunks table, retrieval, LLM call with grounding rule, citations, 20-50 question evaluation set.

Principle: Understand -> Implement -> Evaluate -> Improve. Every technology must solve a real Eryysyn problem.

## 10. Habits and gotchas

- `git status` before `git add`. `.env` must never appear. Never paste secret keys in chat.
- Write the owner filter in every query. Cross-user isolation test must keep passing (and fail when I remove the filter).
- ModuleNotFoundError for my own code: check pwd, PYTHONPATH, and `__init__.py`.
- Python code goes in .py files. git, pip, pytest, curl go in the terminal.
- pip install goes into the active .venv, so check that `(.venv)` shows.
- uvicorn and pytest run from `backend/`. Scratch scripts run with `PYTHONPATH=. python ../scratch/file.py`.
- Commit often (conventional commits: feat, fix, docs, chore, refactor, test).
- Reactivate: `cd ~/projects/eryysyn && source .venv/bin/activate && cd backend`.

## 11. Open items

- [x] clean_text exists in extract.py; pages[10] checked (no headers/footers).
- [x] Paragraph breaks fixed: `extract.py` now uses y-gaps between blocks (gap > 1.4x median line gap = new paragraph, joined with blank line). `clean_text` is whitespace-only.
- [x] Chunker written: `backend/app/rag/chunk.py` (bge tokenizer, whole paragraphs packed to <=250 tokens, headings glued to next paragraph, long paragraphs split by sentence, no overlap yet). Tests in `tests/test_chunk.py`. Real PDF: 53 chunks, 2-250 tokens, avg 162, none over 250.
- [ ] Tiny chunks (e.g. 2-14 tokens: a heading alone at a page end, e-mail line). Decide: min-size merge/filter, or accept and measure with the eval set.
- [x] chunks table created in Supabase via `backend/migrations/001_chunks.sql` (vector(384), HNSW cosine, workspace_id index, RLS on with no policies).
- [x] Step 4 done: `rag/embed.py` (bge, query prefix, normalized), `services/indexing.py` (extract->chunk->embed->insert in ONE transaction, all or nothing), upload now indexes synchronously (status uploaded->indexed|failed), `POST /documents/{id}/index` retries/re-indexes. Tests: `tests/test_indexing.py`.
- [x] Step 5 retrieval done: `services/retrieval.py` (`search_chunks`, cosine `<=>`, WHERE workspace_id + embedding_model, hnsw.iterative_scan) and `POST /workspaces/{id}/search` (owner check, 404, k 1-20). Tests: `tests/test_search.py`. Pushed steps 1-4 to origin/main.
- [ ] Next: step 6 generation (prompt with grounding rule, LLM call behind one function in `llm/`, answer + citations, refusal with `citations: []`).
- [x] ADR-004 added to docs/blueprint.md. [ ] "different from ChatGPT" line still to add.
- [ ] Commit pending work.
- Later: register screen, RLS (Phase 4), background workers (Phase 8), pip freeze / dependency list.
