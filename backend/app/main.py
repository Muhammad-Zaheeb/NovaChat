import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.observability import init_sentry
from app.core.security_headers import SecurityHeadersMiddleware
from app.services import cleanup
from app.routers import auth, conversations, files, friends, health, users
from app.ws.router import router as ws_router

log = logging.getLogger("novachat")

if settings.is_production:
    problems = settings.check_production()
    if problems:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))

init_sentry()

# Everything the app serves from code lives under /api (REST, /api/ws, /api/docs); the built
# frontend owns every other path. One origin, so cookies and the WebSocket need no CORS.
@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(cleanup.cleanup_loop())  # first sweep now, then hourly
    yield
    task.cancel()


app = FastAPI(
    lifespan=lifespan,
    title="NovaChat",
    docs_url=None if settings.is_production else "/api/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)

api = APIRouter(prefix="/api")
for r in (health.router, auth.router, conversations.router, users.router, files.router, friends.router, ws_router):
    api.include_router(r)
@api.get("/{path:path}", include_in_schema=False)
async def api_not_found(path: str):
    raise HTTPException(status_code=404, detail="Not found")


app.include_router(api)


_dist = (Path(__file__).resolve().parent.parent / settings.FRONTEND_DIST).resolve()
if (_dist / "index.html").is_file():

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        """Static files from the Vite build; any other path gets index.html (client-side routing)."""
        target = (_dist / path).resolve()
        if path and target.is_file() and target.is_relative_to(_dist):
            immutable = path.startswith("assets/")  # hashed filenames
            cache = "public, max-age=31536000, immutable" if immutable else "no-cache"
            return FileResponse(target, headers={"Cache-Control": cache})
        return FileResponse(_dist / "index.html", headers={"Cache-Control": "no-cache"})
else:
    log.info("No frontend build at %s: serving the API only", _dist)

    @app.get("/", include_in_schema=False)
    async def root():
        return {"message": "NovaChat API running"}
