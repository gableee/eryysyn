"""Checks on the database structure itself (not on behaviour)."""

from app.db.session import pool


def _indexed_columns(table: str) -> set[str]:
    """Columns that are the FIRST column of some index on `table` (what a lookup by that column can use)."""
    with pool.connection() as conn:
        rows = conn.execute(
            "select a.attname "
            "from pg_index i "
            "join pg_class t on t.oid = i.indrelid "
            "join pg_attribute a on a.attrelid = t.oid and a.attnum = i.indkey[0] "
            "where t.relname = %s",
            (table,),
        ).fetchall()
    return {r[0] for r in rows}


def test_citation_links_are_indexed_so_deleting_a_document_stays_fast():
    # "on delete set null" makes Postgres find every citation that points at a deleted chunk or
    # document. Without an index on that column it reads the whole table, once per deleted row.
    cols = _indexed_columns("message_citations")
    assert "chunk_id" in cols
    assert "document_id" in cols


def test_messages_can_store_the_complete_question_that_was_searched():
    # Migration 004: each user message saves the complete question it was searched as (the "relay").
    with pool.connection() as conn:
        row = conn.execute(
            "select data_type, is_nullable from information_schema.columns "
            # table_schema matters: Supabase has its own realtime.messages table too.
            "where table_schema = 'public' and table_name = 'messages' "
            "and column_name = 'standalone_question'").fetchone()
    assert row == ("text", "YES")
