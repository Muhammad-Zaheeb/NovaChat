from fastapi import FastAPI
from app.routers import health, auth

app = FastAPI(title="NovaChat")

app.include_router(health.router)
app.include_router(auth.router)


@app.get("/")
def root():
    return {"message": "NovaChat API running 🚀"}