-- Phase 3, step 6: chats. A conversation holds messages; an assistant message holds citations.

create table conversations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,  -- ownership comes from the workspace, like documents
  title        text,                                                       -- null until the first question
  instructions text not null default '' check (char_length(instructions) <= 500),  -- per-chat tone ("talk like my friend"); the limit keeps room for passages in the prompt
  created_at   timestamptz not null default now()
);

-- "List my chats, newest first" is one index scan.
create index conversations_workspace_created_idx on conversations (workspace_id, created_at desc);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,   -- order inside a chat. A question and its answer are saved in ONE transaction,
                                                         -- and now() is the transaction start time, so both get the same created_at.
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  refused         boolean not null default false,        -- true = "Not found in your documents."
  created_at      timestamptz not null default now()
);

create index messages_conversation_seq_idx on messages (conversation_id, seq);

create table message_citations (
  message_id  uuid not null references messages(id) on delete cascade,
  n           int  not null check (n >= 1),                       -- the [n] written in the answer text
  chunk_id    uuid references chunks(id) on delete set null,      -- ADR-003. Also becomes null after a re-index, which replaces chunks
  document_id uuid references documents(id) on delete set null,   -- null = source removed
  filename    text not null,                                      -- copies of the facts (ADR-003): old answers stay honest
  page        int  not null check (page >= 1),                    -- after the document is deleted
  excerpt     text not null,
  primary key (message_id, n)                                     -- one row per [n] per answer
);

-- Same as documents/workspaces/chunks: RLS on, no policies = the Supabase API (anon/authenticated) sees nothing.
-- The backend connects as the DB owner and bypasses RLS, so it must filter by owner itself.
alter table conversations     enable row level security;
alter table messages          enable row level security;
alter table message_citations enable row level security;
