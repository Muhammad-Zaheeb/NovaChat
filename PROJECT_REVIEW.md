# NovaChat — Project Review

_Reviewed 2026-11-14. Last commit: 64044a3 "Initial project setup" (2026-06-29)._

## TL;DR

- **About 5–8% of the planned product is built.** There is a backend skeleton with register, login and `/me` drafted. **The frontend folder is empty.**
- **The backend does not start right now.** It imports 4 modules that don't exist, `.env` is empty (0 bytes), and password hashing crashes on every call because of a library version clash.
- Everything since the first commit (auth, models, schemas, routers) is **uncommitted**.
- **Rough time to an MVP** (auth, 1:1 and group chat in real time, presence, typing, read receipts, a working React UI) is **about 90–130 focused hours**, or **5–7 weeks at about 20 h/week**. The full README feature list (adding file sharing, voice messages and production deploy) is **about 150–200 hours**.

---

## 1. What's done

| Area | File | State |
|---|---|---|
| Project README / tech stack | `README.md` | ✅ Done |
| `.gitignore` (ignores `.env`, venv, node_modules) | `.gitignore` | ✅ Good |
| Python venv + pinned deps | `backend/venv`, `requirements.txt` | ⚠️ Deps conflict (see §2) |
| FastAPI app entry | `app/main.py` | ⚠️ Imports a missing `health` router |
| `User` model | `app/models/user.py` | ⚠️ Works once `Base` exists |
| Auth schemas | `app/schemas/auth.py`, `user.py` | ✅ Minimal but OK |
| Password hashing | `app/auth/password.py` | ❌ Crashes at runtime |
| JWT create/decode | `app/auth/jwt.py` | ⚠️ Needs missing `app.core.config` |
| Register / Login / Me endpoints | `app/routers/auth.py` | ⚠️ Logic drafted; `/me` is broken |
| DB session dependency | `app/database/session.py` | ⚠️ Needs missing `engine` |
| Frontend | `frontend/` | ❌ Empty |
| Alembic migrations, tests, Docker, CI | — | ❌ None |

Postgres (`psql`) and Node v26 are installed on this machine, so the tooling is ready.

## 2. Blocking bugs (fix these first, ~2–3 h)

1. **Missing modules** that the code already imports:
   - `app/routers/health.py`, imported in `main.py`
   - `app/database/base.py` (the `Base = declarative_base()`)
   - `app/database/engine.py` (`engine`, `SessionLocal`)
   - `app/core/config.py` (`settings` with `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `DATABASE_URL`)

   Confirmed: `python -c "import app.main"` fails with `ModuleNotFoundError: app.database.engine`.
2. **`backend/.env` is empty.** It needs `DATABASE_URL`, `SECRET_KEY`, `ALGORITHM=HS256` and `ACCESS_TOKEN_EXPIRE_MINUTES`. Also add a committed `.env.example`.
3. **passlib 1.7.4 + bcrypt 5.0.0 are incompatible.** Hashing even `"x"` raises `ValueError: password cannot be longer than 72 bytes`, so register and login both fail. Fix: drop passlib and call `bcrypt` directly (recommended, since passlib is unmaintained), or pin `bcrypt==4.0.1`.
4. **`/auth/me` signature is wrong.** `request=Depends()` is not valid. Use `request: Request`. Better: write a reusable `get_current_user` dependency, since every chat endpoint and the WebSocket will need it.
5. **The bare `except:` in `/me`** catches the `404 User not found` HTTPException too, and turns it into "Invalid token". Catch `JWTError` only.
6. **No tables get created.** There is no Alembic setup and no `create_all`. Run `alembic init` and make a first migration for `users`.

## 3. Other issues in the existing code (~2 h)

- **Duplicate username gives a 500 error.** Register only checks email, but `username` is unique in the database too, so this raises an unhandled `IntegrityError`.
- No password rules (min length, max 72 bytes for bcrypt) and no username rules (length, allowed characters) in `RegisterRequest`.
- Login returns `400` on bad credentials; `401` is the conventional status.
- There is no `/auth/logout` to clear the cookie.
- Missing dependencies: `pydantic-settings` (for config) and `websockets` (or `uvicorn[standard]`). Without the second, **FastAPI WebSockets won't work under uvicorn**.
- `python-jose` has had security advisories and is slow to get updates. Consider switching to `PyJWT`.
- `datetime.utcnow()` is deprecated. Use `datetime.now(timezone.utc)` with `DateTime(timezone=True)`.
- `class Config:` in `UserOut` is the Pydantic v1 style. Use `model_config = ConfigDict(from_attributes=True)`.
- There is no CORS middleware. The Vite dev server (`:5173`) can't call the API with cookies until `CORSMiddleware` is added with `allow_credentials=True`.
- Cookie `secure=False` is hard-coded. Drive it from settings (`True` in production).
- Requirements contain `tomli` and `exceptiongroup` (Python <3.11 backports). Pick one Python version (3.12+ recommended) and record it in the README or a `.python-version` file.

## 4. What's left: roadmap with estimates

Estimates are focused solo-dev hours at an intermediate level. Add 20–30% buffer.

### Phase 0: Make the backend run (≈ 4–6 h)
Fix §2 and §3, add Alembic, add `get_current_user`, and add a health check that pings the database. **Commit.**

### Phase 1: Chat data model and REST API (≈ 12–16 h)
- Models: `Conversation` (type: direct/group, name, created_by), `ConversationMember` (user, role, `last_read_message_id`, joined_at), and `Message` (conversation, sender, content, type: text/file/voice, created_at, edited_at, deleted_at).
- Endpoints: list my conversations (with last message and unread count), create a DM (idempotent), create a group, add/remove members, get paginated messages (cursor-based on `id`), send a message, and search users.
- Indexes on `(conversation_id, id)` for messages.

### Phase 2: Real-time over WebSockets (≈ 16–22 h)
- `/ws` endpoint authenticated with the cookie JWT, plus a connection manager that maps user → sockets (multiple tabs).
- Event protocol (JSON `{type, payload}`): `message.new`, `typing.start/stop`, `message.read`, `presence.online/offline`.
- Persist first, then broadcast to conversation members.
- **Plan for scale early:** a single-process in-memory manager breaks with more than one worker. Use **Redis pub/sub** (add +4–6 h) as soon as you deploy with more than one instance.

### Phase 3: Frontend MVP (≈ 35–50 h). This is the biggest chunk.
- Vite + React + TS scaffold, React Router, Zustand stores (auth, conversations, messages, presence), and an Axios instance with `withCredentials`.
- Pages: Login, Register, and the main chat layout (sidebar conversation list, message pane, composer).
- WebSocket client with auto-reconnect and backoff, plus optimistic sends.
- Infinite scroll up for history, unread badges, typing indicator, read ticks, online dots.
- New DM / new group modals and user search.
- Responsive layout and empty/loading/error states.
- Recommended UI kit to save time: **Tailwind + shadcn/ui**. Add **TanStack Query** for REST data.

### Phase 4: Group-chat polish, presence and receipts (≈ 8–12 h)
Group admin roles, rename, leave group, "last seen", and per-member read state in groups.

### Phase 5: File sharing and voice messages (≈ 20–30 h)
- Upload via **pre-signed URLs to S3-compatible storage** (MinIO locally, then S3/R2 in production). Don't stream files through FastAPI.
- `Attachment` model (message_id, url, mime, size, width/height/duration).
- Image previews and thumbnails, plus size/type limits.
- Voice: `MediaRecorder` in the browser (webm/opus), a waveform/progress player, and a duration cap.

### Phase 6: Quality, security, deploy (≈ 20–30 h)
- **Tests:** pytest + httpx `AsyncClient` for auth/chat, WebSocket tests, and a few Playwright end-to-end tests.
- **Security:** rate limiting on login/register (`slowapi`), refresh-token rotation (short access token plus a refresh cookie), CSRF protection for cookie auth (SameSite=Lax plus a CSRF token or origin check), message-length limits, and authorization checks that the user is a member of the conversation on every read/write and socket event.
- **Docker Compose** (api, postgres, redis, minio, frontend), GitHub Actions CI (lint with ruff, type-check with mypy, tests, frontend build), and pre-commit hooks.
- Deploy: Render/Railway/Fly.io for the API, Vercel/Netlify for the frontend (or one VPS with Caddy), managed Postgres, HTTPS (`secure=True` cookies).
- Logging (structured), Sentry for errors.

### Totals

| Scope | Hours | At ~20 h/week |
|---|---|---|
| Phase 0 (backend runs) | 4–6 | first sitting |
| MVP (Phases 0–4) | ~75–105 (+buffer → 90–130) | 5–7 weeks |
| Full README feature set (0–5) | ~95–135 | 6–8 weeks |
| Production-ready (0–6) | ~150–200 | 8–10 weeks |

## 5. Feature ideas beyond the README

**High value, low effort**
- Edit/delete messages (soft delete), reply-to/quote, emoji reactions
- Message search (Postgres full-text `tsvector`)
- Unread counts plus browser tab title badge
- User avatars and profile/bio, dark mode

**Medium effort**
- Link previews (Open Graph fetch, done server-side and cached)
- Push/desktop notifications (Web Push API with a service worker), mute conversations
- Pinned messages, starred messages
- Message delivery states (sent → delivered → read)

**Bigger / differentiators**
- AI features: thread summaries ("catch me up"), smart replies, translation (fits the "Nova" brand)
- Voice/video calls (WebRTC; use LiveKit rather than building your own SFU)
- End-to-end encryption (complex, only if it's core to the pitch)
- PWA / mobile app (React Native or Capacitor)

## 6. Recommendations

1. **Commit now.** Months of work exist only in the working tree. Commit in small steps from here on: fix the blockers, commit, add each feature, commit.
2. **Decide sync vs async database access now.** The current code is sync SQLAlchemy. WebSockets in FastAPI are async, and mixing sync DB calls into async handlers blocks the event loop. **Recommended: switch to async SQLAlchemy (`asyncpg` + `AsyncSession`)** before writing more endpoints; it's cheap to change today and expensive later.
3. **Use a layered structure:** `core/` (config, security), `models/`, `schemas/`, `services/` (business logic), `routers/` (thin), `ws/` (socket manager). Add `__init__.py` files to make the packages explicit.
4. **One auth dependency, used everywhere,** including WebSocket handshakes. Authorization ("is this user a member of this conversation?") belongs in services and must be tested.
5. **Write tests from Phase 1 on.** At least the auth flow and a "user can't read another conversation" test.
6. **Build vertical slices.** Get login, then a DM, then sending a message working end to end in the UI before group chats or files. You'll find integration issues (CORS, cookies, sockets) early.
7. **Keep `.env.example` and a "Run locally" section in the README** so future-you can restart after a break in 5 minutes.
8. **For a portfolio:** deploy a live demo, add screenshots/GIF and an architecture diagram to the README, and write up the WebSocket/Redis design. These show more than extra features do.

## 7. Suggested next session (first 2–3 hours)

1. Commit current work as-is.
2. Create `core/config.py` (pydantic-settings), `database/base.py`, `database/engine.py`, `routers/health.py`; fill `.env`, add `.env.example`.
3. Replace passlib with direct `bcrypt`, add a 72-byte password limit, and fix `/me` with a `get_current_user` dependency.
4. `alembic init`, then the first migration, then run the server and test register/login/me in `/docs`.
5. Commit, then start Phase 1.
