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

- User Authentication (email verification, multi-tab safe)
- Friend requests (DMs and group adds are friends-only)
- Replies, message edit (15 min) and delete, emoji reactions
- In-conversation message search, unread divider
- Profiles (display name, bio, avatar colour, last seen)
- Browser notifications + sound, per-conversation mute
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

Connect to `ws(s)://<host>/ws`. The browser sends the same `access_token` cookie as the REST API (use `credentials: "include"` semantics, i.e. log in first). Missing/invalid cookie → rejected (close code 4401); disallowed `Origin` → rejected (4403).

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

Limit: connections are held in-process, so this works with a single server process; Redis pub/sub replaces it at deploy time.
