# NovaChat 💬

A production-ready real-time messaging platform built with React, FastAPI, PostgreSQL, SQLAlchemy, JWT Authentication, and WebSockets.

---

## 🚀 Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Zustand
- React Router
- Axios

### Backend

- FastAPI
- PostgreSQL
- SQLAlchemy 2.0
- Alembic
- JWT
- WebSockets

---

## Features

- User Authentication
- Real-time Messaging
- Group Chats
- Typing Indicators
- Read Receipts
- Online Presence
- File Sharing
- Voice Messages

---

## Status

🚧 Under Development
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

API runs at http://localhost:8000 (docs at `/docs`, DB check at `/health`).
Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /users/search`, plus `/conversations` (direct/group chats, members, messages, read receipts and unread counts).

## Run locally (frontend)

Requires Node 22+ and the backend running on port 8000.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

The dev server proxies `/api` (prefix stripped) and `/ws` to the backend, so the browser sees a single origin and the auth cookie works without extra CORS setup. Other scripts: `npm run build`, `npm run lint`, `npm run format`.

## WebSocket protocol

Connect to `ws(s)://<host>/ws`. The browser sends the same `access_token` cookie as the REST API (use `credentials: "include"` semantics, i.e. log in first). Missing/invalid cookie → rejected (close code 4401); disallowed `Origin` → rejected (4403).

All frames are JSON: `{"type": "<event>", "payload": {...}}`. Bad input gets an `error` event; the socket stays open.

**Client → server**

| type | payload |
|---|---|
| `message.send` | `conversation_id`, `content` (1–4000 chars), `client_id` (optional, echoed back) |
| `typing.start` / `typing.stop` | `conversation_id` (`start` is limited to 1 per conversation per second) |
| `message.read` | `conversation_id`, `message_id` |
| `ping` | none |

**Server → client**

| type | payload |
|---|---|
| `message.new` | full message (`id, conversation_id, sender_id, content, type, created_at, edited_at`) + `client_id` (null if sent via REST). Sent to all members, including the sender. |
| `typing` | `conversation_id, user_id, is_typing` (not sent to the typer) |
| `message.read` | `conversation_id, user_id, message_id` (all members) |
| `presence` | `user_id, online` (users sharing a conversation; fired on first connect / last disconnect) |
| `conversation.updated` | `conversation_id, change` (`member_added` \| `member_removed` \| `member_left`), `user_id` (the affected user). Sent to all remaining members **and** the affected user, so an added user can load the conversation and a removed one can drop it. |
| `error` | `code` (`invalid_payload`, `bad_request`, `unknown_event`, `not_found`, `forbidden`…), `detail` |
| `pong` | none |

`POST /conversations/{id}/messages` and `POST /conversations/{id}/read` emit the same events. Load initial presence with `GET /users/online?ids=1,2,3`.

Limit: connections are held in-process, so this works with a single server process; Redis pub/sub replaces it at deploy time.
