from fastapi import FastAPI

app = FastAPI(title="Eryysyn")

@app.get("/health")
def health():
    return {"status": "ok"}