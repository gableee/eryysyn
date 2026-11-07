from fastapi import FastAPI
from app.db.session import pool
from app.api import workspaces
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Eryysyn")
app.include_router(workspaces.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    with pool.connection() as conn:
        row = conn.execute("select 1").fetchone()
    return {"status": "ok", "db": row[0] == 1}



