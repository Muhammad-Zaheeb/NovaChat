from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, conversations, friends, health, users
from app.ws.router import router as ws_router

app = FastAPI(title="NovaChat")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(conversations.router)
app.include_router(users.router)
app.include_router(friends.router)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {"message": "NovaChat API running"}
