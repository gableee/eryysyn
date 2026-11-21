-- Phase 3, follow-up questions: each user message saves the complete question it was searched as.
--
-- A follow-up like "who does it apply to?" is rewritten into "Who does strict liability apply to?"
-- before search. Saving that complete question lets the next turn's rewriter read it instead of the
-- vague typed text, so the topic is handed turn to turn (a relay) and survives long chats.
-- It also shows what Ery actually searched for ("Searched for: ...").
--
-- Null = a message saved before this migration (the reader falls back to `content`).
-- Assistant rows leave it null. 1000 = the same limit as a typed question.
--
-- Undo: alter table messages drop column standalone_question;

alter table messages
  add column standalone_question text
  check (char_length(standalone_question) <= 1000);
