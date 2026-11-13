# Eryysyn Blueprint

## 1. Product
- Core loop (one sentence):
- First user:

## 2. MVP scope
| Feature | Must / Should / Later | Why |

## 3. Decisions (ADRs)
### ADR-001: Owner-only vs. personal workspace
- Decision: Every user gets a private workspace automatically. Documents belong to a workspace, not directly to a user. Sharing later means duplicating a workspace and inviting members to the copy.
- Reason: Private by default, and the original stays protected. Sharing can be added later without redesigning the database.
- Cost accepted: One extra table now, for a feature the MVP doesn’t use yet.

Grounding rule: the LLM answers only from retrieved passages and says “not found in your documents” when they don’t contain the answer.


### ADR-002: Deleting documents

- Decision: Deleting a document permanently removes the file, its chunks, and its vectors.
- Reason: Users must be able to truly delete their data.
- Cost accepted: No undo.


### ADR-003: Citations after deletion:

- Decision: Citations are kept with a “source removed” marker when their source is deleted.
- Reason: Past answers stay honest about what they were based on.
- Cost accepted: Slight data duplication, and a nullable foreign key.

### ADR-004: Chunk within pages

- Decision: Chunks are built page by page, never across a page break.
- Reason: Each chunk has one exact page, so citations are precise and verifiable.
- Cost accepted: Ideas that cross a page break are split, so retrieval may miss context.

## 4. Architecture (next)
## 5. Database schema (next)
## 6. API contracts (later)
## 7. Repo structure (last)