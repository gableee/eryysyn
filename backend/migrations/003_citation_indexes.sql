-- Phase 3, step 6 review fix (#9): index the two "on delete set null" links in message_citations.
--
-- Deleting (or re-indexing) a document deletes its chunks. For each deleted chunk, Postgres must
-- find every citation with that chunk_id and set it to NULL (ADR-003: "source removed").
-- Without an index that is a full scan of message_citations per deleted chunk, so deletes get
-- slower as chat history grows. The same applies to document_id.
--
-- Undo: drop index message_citations_chunk_id_idx, message_citations_document_id_idx;

create index message_citations_chunk_id_idx    on message_citations (chunk_id);
create index message_citations_document_id_idx on message_citations (document_id);
