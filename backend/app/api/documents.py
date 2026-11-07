import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from app.core.auth import get_current_user_id
from app.core.storage import supabase, BUCKET
from app.db.session import pool

router = APIRouter(tags=["documents"])
MAX_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/workspaces/{workspace_id}/documents", status_code=201)
def upload_document(
    workspace_id: uuid.UUID,
    file: UploadFile,
    user_id: str = Depends(get_current_user_id),
):
    # 1. ownership check
    with pool.connection() as conn:
        owned = conn.execute(
            "select 1 from workspaces where id = %s and owner_id = %s",
            (workspace_id, user_id),
        ).fetchone()
    if not owned:
        raise HTTPException(404, "Workspace not found")

    # 2. validate size and type
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large")
    if not data.startswith(b"%PDF"):
        raise HTTPException(415, "Not a PDF")

    # 3. save the original, then the row
    doc_id = uuid.uuid4()
    path = f"{workspace_id}/{doc_id}.pdf"
    supabase.storage.from_(BUCKET).upload(
        path, data, {"content-type": "application/pdf"}
    )
    try:
        with pool.connection() as conn:
            conn.execute(
                "insert into documents (id, workspace_id, filename, storage_path) "
                "values (%s, %s, %s, %s)",
                (doc_id, workspace_id, file.filename, path),
            )
    except Exception:
        supabase.storage.from_(BUCKET).remove([path])  # no orphaned files
        raise

    return {"id": str(doc_id), "filename": file.filename, "status": "uploaded"}


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