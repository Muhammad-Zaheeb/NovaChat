# NovaChat 💬

[![CI](https://github.com/Muhammad-Zaheeb/NovaChat/actions/workflows/ci.yml/badge.svg)](https://github.com/Muhammad-Zaheeb/NovaChat/actions/workflows/ci.yml)

A real-time messaging app with friend requests, group chats, media sharing and voice messages, built with **React + TypeScript** on the frontend and **FastAPI + PostgreSQL** on the backend, connected over **WebSockets**.

> 🌐 **Live demo:** <https://novachat-v022.onrender.com> (free hosting: the first visit after idle takes about a minute to wake up)

---

## ✨ Features

**Messaging**
- Real-time one-to-one and group chats over WebSockets
- Typing indicators, read receipts ("Seen" / "Seen by N") and online presence with last seen
- Replies with quotes, editing (within 15 minutes), deleting and emoji reactions
- Search inside a conversation, unread counts and a "New messages" divider
- Optimistic sending with retry, plus automatic reconnect and resync

**Media**
- Photo, video and file sharing with drag-and-drop, paste, upload progress and a full-screen viewer
- Voice messages with recording, preview and a waveform player
- Profile pictures with a crop step

**People**
- Friend requests: you can only message, or add to a group, people who have accepted
- Group admins can add and remove members, and members can leave
- Search by display name or username, with mutual friends to tell people apart

**Accounts & security**
- Email verification and password reset with 6-digit codes
- Rate limiting on login and other auth endpoints
- Cookie-based JWT sessions that stay in sync across tabs
- Uploads checked by their real file type, photo location data (EXIF) removed, and downloads limited to chat members
- Security headers (CSP, HSTS and more) in production

**Experience**
- Light, dark and system themes
- Layouts for phone and desktop
- Ctrl/⌘ + K quick switcher and keyboard shortcuts
- Browser notifications with sound, and mute per conversation

---

## 🧱 Tech stack

| Layer | Tools |
|---|---|
| **Frontend** | React, TypeScript, Vite, Tailwind CSS, Zustand, React Router, Axios, lucide icons |
| **Backend** | FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL, asyncpg, PyJWT, bcrypt, Pillow |
| **Real-time** | WebSockets (one connection per tab, auth by cookie) |
| **Storage** | Local disk in development, S3-compatible storage in production |
| **Quality** | pytest (94 tests), ESLint, GitHub Actions CI, optional Sentry |
| **Deploy** | Docker / Render, Neon Postgres, Supabase Storage, Brevo email, all on free tiers |

---

## Run locally (backend)

Requires Python 3.15 (see `.python-version`) and PostgreSQL running on localhost:5432.

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then edit DATABASE_URL and set a real SECRET_KEY
createdb novachat           # once
alembic upgrade head        # create tables
uvicorn app.main:app --reload
```

Run tests (uses a separate `novachat_test` database; never touches `novachat`):

```bash
createdb novachat_test      # once
python -m pytest
```

API runs at http://localhost:8000. **All API routes live under `/api`** (docs at `/api/docs` in development, liveness `/api/health`, DB check `/api/health/db`); the examples below omit the `/api` prefix. If `frontend/dist` exists the same server also serves the built app at `/`.
Auth: `POST /auth/register`, `/auth/verify-email`, `/auth/resend-code`, `/auth/login`, `/auth/logout`, `GET /auth/me`, `POST /auth/forgot-password {email}` (always 200) and `POST /auth/reset-password {email, code, new_password}` (code valid 15 min, 5 attempts; a reset signs out every existing session). Auth endpoints are rate limited per IP and per email (429 + `Retry-After`). Also `GET /users/search` and `/conversations`.

## Run locally (frontend)

Requires Node 22+ and the backend running on port 8000.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

The dev server proxies `/api` (REST and the `/api/ws` WebSocket, prefix kept) to the backend, so the browser sees a single origin and the auth cookie works without extra CORS setup. Other scripts: `npm run build`, `npm run lint`, `npm run format`.

## Email setup (Gmail)

New accounts must verify their email with a 6-digit code (valid 10 minutes, 5 attempts, resends limited to 1/min and 5/hour). By default (`EMAIL_BACKEND=console`) the code is printed in the backend terminal. To send real email through Gmail:

1. Turn on **2-Step Verification**: Google Account → Security → 2-Step Verification.
2. Create an **App password**: Google Account → Security → *App passwords* (search for it if it is not listed), name it "NovaChat" and copy the 16-character password.
3. In `backend/.env` set:

```
EMAIL_BACKEND=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.address@gmail.com
SMTP_PASSWORD=<the 16-character app password, no spaces>
EMAIL_FROM=NovaChat <your.address@gmail.com>
```

4. Restart the backend. Never commit `.env`.

## Friends

Direct chats and group membership require friendship. `POST /friends/requests {user_id}` (auto-accepts if they already asked you), `GET /friends/requests` (`incoming`/`outgoing`), `POST /friends/requests/{id}/accept|decline`, `DELETE /friends/requests/{id}` (cancel yours), `GET /friends`, `DELETE /friends/{user_id}`. `/users/search` results carry `friendship_status` (`none|pending_outgoing|pending_incoming|friends`).
Rules: `POST /conversations/direct` to a non-friend → 403 `not_friends` (an already-existing DM stays usable); group creation and adding members need each person to be the adder's friend. A declined request can be re-sent immediately. Existing conversations are unaffected by unfriending.

## WebSocket protocol

Connect to `ws(s)://<host>/api/ws`. The browser sends the same `access_token` cookie as the REST API (use `credentials: "include"` semantics, i.e. log in first). Missing/invalid cookie → rejected (close code 4401); disallowed `Origin` → rejected (4403).

All frames are JSON: `{"type": "<event>", "payload": {...}}`. Bad input gets an `error` event; the socket stays open.

**Client → server**

| type | payload |
|---|---|
| `message.send` | `conversation_id`, `content` (1–4000 chars), `client_id` (optional, echoed back), `reply_to_id` (optional) |
| `typing.start` / `typing.stop` | `conversation_id` (`start` is limited to 1 per conversation per second) |
| `message.read` | `conversation_id`, `message_id` |
| `ping` | none |

**Server → client**

| type | payload |
|---|---|
| `message.new` | full message (`id, conversation_id, sender_id, content, type, created_at, edited_at, deleted, reply_to{id,sender_id,content,deleted}, reactions[{emoji,user_ids}]`) + `client_id` (null if sent via REST). Sent to all members, including the sender. |
| `typing` | `conversation_id, user_id, is_typing` (not sent to the typer) |
| `message.read` | `conversation_id, user_id, message_id` (all members) |
| `message.updated` | full message, same shape as `message.new`. Fired on edit (`PATCH`), delete (`DELETE`, `deleted: true`, empty content) and reaction toggle. All members. |
| `user.updated` | `id, username, display_name, bio` — a peer or friend changed their profile (also to the user's own tabs) |
| `conversation.muted` | `conversation_id, muted` — only to the user who changed it (their other tabs) |
| `presence` | `user_id, online, last_seen_at` (set when going offline; users sharing a conversation; fired on first connect / last disconnect) |
| `conversation.updated` | `conversation_id, change` (`member_added` \| `member_removed` \| `member_left`), `user_id` (the affected user). Sent to all remaining members **and** the affected user, so an added user can load the conversation and a removed one can drop it. |
| `friend.request` | `id, user{id,username}` — someone sent you a friend request |
| `friend.accepted` | `id, user{id,username}` — your request was accepted (or a mutual request auto-accepted) |
| `friend.removed` | `user_id`, optional `request_id` — the other party unfriended you, declined or cancelled a request; refetch `/friends` and `/friends/requests` |
| `error` | `code` (`invalid_payload`, `bad_request`, `unknown_event`, `not_found`, `forbidden`…), `detail` |
| `pong` | none |

`POST /conversations/{id}/messages` and `POST /conversations/{id}/read` emit the same events.

REST for the message features: `PATCH /conversations/{id}/messages/{mid}` `{content}` (own, within 15 min), `DELETE …/{mid}` (own), `POST …/{mid}/reactions` `{emoji}` (toggle; 👍 ❤️ 😂 😮 😢 🙏), `GET …/messages?q=text` (ILIKE search), `PUT /conversations/{id}/mute` `{muted}`, `PATCH /users/me` `{display_name, bio}`. Load initial presence with `GET /users/online?ids=1,2,3`.

Limit: connections (and the rate limiter) are held in-process, so run a single server process; Redis would replace both to scale out.

## Deploy (free)

Everything below is free and needs no credit card. One Render web service serves the API and the built frontend on a single origin; data lives in Neon (Postgres) and Supabase Storage (files). Do the steps in order and keep a scratch note of the values.

### 1. Neon (database)
1. Sign up at <https://neon.tech> → create a project (pick the region closest to you).
2. Dashboard → **Connect** → turn **off** "Connection pooling" → copy the connection string (`postgresql://…?sslmode=require`). This is `DATABASE_URL`. Paste it as-is; the app converts it for asyncpg. Use the direct (non `-pooler`) host so migrations work.

### 2. Supabase Storage (files)
1. Sign up at <https://supabase.com> → new project.
2. **Storage** → New bucket → name it (e.g. `novachat`) → keep **Public bucket OFF** (private).
3. Project Settings → **Storage** → *S3 connection*: copy the **Endpoint** (`S3_ENDPOINT_URL`) and **Region** (`S3_REGION`), then **New access key** and copy the Access key ID and Secret (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). `S3_BUCKET` is the bucket name.

### 3. Email
Render's free tier blocks outbound SMTP, so use **Brevo** (HTTP API, 300 emails/day free): <https://www.brevo.com> → sign up → *Senders, Domains & Dedicated IPs* → add and verify a sender address (your Gmail works) → *SMTP & API* → **API keys** → create one. Set `EMAIL_BACKEND=brevo`, `BREVO_API_KEY=…`, `EMAIL_FROM=NovaChat <the verified address>`.
Gmail SMTP (see "Email setup" above) works on hosts that allow port 587; if used, `EMAIL_BACKEND=smtp` plus the `SMTP_*` variables.

### 4. Sentry (optional)
<https://sentry.io> → new project → Python/FastAPI → copy the DSN (`SENTRY_DSN`). Create a second project for React and copy its DSN (`VITE_SENTRY_DSN`). Leave both unset to disable.

### 5. Render (the app)
1. Sign up at <https://render.com> with GitHub → **New → Blueprint** → pick this repo. `render.yaml` creates a free Docker web service named `novachat` (build: frontend + backend; start: `alembic upgrade head`, then uvicorn with 1 worker; health check `/api/health`).
2. Fill the prompted variables (table below). Deploy. The URL is `https://<name>.onrender.com`.
3. After the first deploy, set `CORS_ORIGINS` to `["https://<name>.onrender.com"]` (JSON list) and redeploy.

Migrations run automatically on every start. To run them by hand: Render shell (or locally with the production `DATABASE_URL`) → `cd backend && alembic upgrade head`.
Upload cleanup (unattached files older than 24 h, orphaned objects) runs at start and hourly; to run it manually: `cd backend && python -m app.cleanup`.

### 6. Database backups (GitHub secrets)
Repo → Settings → Secrets and variables → Actions → add: `BACKUP_DATABASE_URL` (Neon direct string), `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`. The *Database backup* workflow then runs daily (and from the Actions tab), uploads `backups/novachat-<timestamp>.sql.gz` to the private bucket and keeps the newest 14. Without the secrets it skips. Never make the bucket public: dumps contain everything.

**Restore:** download a dump from the Supabase dashboard (Storage → bucket → `backups/`), then into an empty database (new Neon branch/project):

```bash
gunzip -c novachat-20260101T031700Z.sql.gz | psql "<target DATABASE_URL, postgresql:// form>"
```

### Environment variables
| Where | Variable | Value |
|---|---|---|
| Render | `ENV` | `production` (set by blueprint) |
| Render | `SECRET_KEY` | generated by the blueprint (≥ 32 random chars) |
| Render | `DATABASE_URL` | Neon direct string |
| Render | `COOKIE_SECURE` / `TRUST_PROXY` | `true` / `true` (set by blueprint) |
| Render | `CORS_ORIGINS` | `["https://<name>.onrender.com"]` |
| Render | `EMAIL_BACKEND`, `EMAIL_FROM`, `BREVO_API_KEY` | `brevo`, `NovaChat <verified@address>`, API key (Gmail: `smtp`, `SMTP_USER`, `SMTP_PASSWORD`) |
| Render | `STORAGE_BACKEND` | `s3` (set by blueprint) |
| Render | `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | from Supabase |
| Render | `SENTRY_DSN`, `VITE_SENTRY_DSN` | optional |
| GitHub secrets | `BACKUP_DATABASE_URL`, `S3_*` (5 values) | as above |

The app refuses to start with `ENV=production` if `SECRET_KEY` is weak, `COOKIE_SECURE` is false, or `STORAGE_BACKEND=local`.

### Free-tier caveats
- **Cold starts:** Render free sleeps after ~15 min idle; the first request then takes about a minute, and open WebSockets drop (the client reconnects). A free uptime pinger (e.g. UptimeRobot hitting `/api/health` every 5 min) keeps it awake; 750 free hours cover one always-on service. `/api/health` does not touch the database, so Neon can still sleep (its first query adds ~1 s).
- **Ephemeral disk:** nothing is stored locally; all files go to Supabase. Free Supabase pauses a project after a week with no activity and caps files at 50 MB (the app's largest limit) and 1 GB total.
- **Single process:** the WebSocket hub and rate limiter are in-memory; do not raise the worker count.
- Neon free is 0.5 GB per project; Brevo free is 300 emails/day.
