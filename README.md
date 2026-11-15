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

API runs at http://localhost:8000 (docs at `/docs`, DB check at `/health`).
Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
