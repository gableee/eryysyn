from fastapi import FastAPI
from app.db.session import pool
from app.api import workspaces


app = FastAPI(title="Eryysyn")
app.include_router(workspaces.router)

@app.get("/health")
def health():
    with pool.connection() as conn:
        row = conn.execute("select 1").fetchone()
    return {"status": "ok", "db": row[0] == 1}



