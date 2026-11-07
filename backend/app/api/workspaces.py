from fastapi import APIRouter, Depends
from app.core.auth import get_current_user_id
from app.db.session import pool

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

@router.get("")
def list_workspaces(user_id: str = Depends(get_current_user_id)):
    with pool.connection() as conn:
        rows = conn.execute(
            "select id, name from workspaces where owner_id = %s", (user_id,)
        ).fetchall()
        if not rows:  # first visit: create the hidden personal workspace
            rows = conn.execute(
                "insert into workspaces (owner_id, name) values (%s, 'Personal') "
                "returning id, name", (user_id,)
            ).fetchall()
    return [{"id": str(r[0]), "name": r[1]} for r in rows]