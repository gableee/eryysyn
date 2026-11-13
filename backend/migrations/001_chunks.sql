-- Phase 3: chunks table (text + page + embedding vector).
-- pgvector is already enabled (vector 0.8.2).

create table chunks (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references documents(id) on delete cascade,  -- ADR-002: deleting a document deletes its chunks
  workspace_id    uuid not null references workspaces(id) on delete cascade, -- duplicated on purpose: filter by owner without a join
  page            int  not null check (page >= 1),
  chunk_index     int  not null check (chunk_index >= 0),
  text            text not null,
  embedding       vector(384) not null,                                      -- bge-small-en-v1.5
  embedding_model text not null,                                             -- vectors from different models are not comparable
  created_at      timestamptz not null default now(),
  unique (document_id, chunk_index)                                          -- also indexes document_id (leading column)
);

-- Every query filters by workspace first.
create index chunks_workspace_id_idx on chunks (workspace_id);

-- Approximate nearest-neighbour search, cosine distance (matches normalized bge vectors).
create index chunks_embedding_hnsw_idx on chunks using hnsw (embedding vector_cosine_ops);

-- Same as documents/workspaces: RLS on, no policies = the Supabase API (anon/authenticated) sees nothing.
-- The backend connects as the DB owner and bypasses RLS, so it must filter by owner itself.
alter table chunks enable row level security;
