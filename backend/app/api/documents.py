@router.get("/workspaces/{workspace_id}/documents")
def list_documents(
    workspace_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    with pool.connection() as conn:
        rows = conn.execute(
            "select d.id, d.filename, d.status, d.created_at "
            "from documents d join workspaces w on w.id = d.workspace_id "
            "where d.workspace_id = %s and w.owner_id = %s "
            "order by d.created_at desc",
            (workspace_id, user_id),
        ).fetchall()
    return [
        {"id": str(r[0]), "filename": r[1], "status": r[2], "created_at": r[3]}
        for r in rows
    ]


    

@router.delete("/documents/{document_id}", status_code=204)
def delete_document(
    document_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    with pool.connection() as conn:
        row = conn.execute(
            "select d.storage_path from documents d "
            "join workspaces w on w.id = d.workspace_id "
            "where d.id = %s and w.owner_id = %s",
            (document_id, user_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Document not found")
        conn.execute("delete from documents where id = %s", (document_id,))
    supabase.storage.from_(BUCKET).remove([row[0]])