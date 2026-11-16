"""Uploads and authenticated downloads. Nothing here is served statically."""
import re
from typing import AsyncIterator

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.config import settings
from app.core.storage import get_storage, new_key
from app.database.session import get_db
from app.dependencies import get_current_user
from app.models.attachment import Attachment, AttachmentKind
from app.models.message import Message
from app.models.user import User
from app.schemas.chat import AttachmentOut
from app.schemas.user import UserOut
from app.services import chat, media
from app.services.chat import ChatError, attachment_out
from app.services.media import MediaError
from app.ws import notify

router = APIRouter(tags=["Files"])
READ_CHUNK = 256 * 1024


async def _read_limited(file: UploadFile, limit: int) -> bytes:
    """Read the upload, aborting as soon as it exceeds `limit` bytes."""
    buf = bytearray()
    while chunk := await file.read(READ_CHUNK):
        buf += chunk
        if len(buf) > limit:
            raise HTTPException(status_code=413, detail=f"File too large (max {limit // media.MB} MB)")
    if not buf:
        raise HTTPException(status_code=400, detail="Empty file")
    return bytes(buf)


def _limit_rate(user: User) -> None:
    if not ratelimit.allow("upload", user.id, settings.UPLOADS_PER_MINUTE):
        raise HTTPException(status_code=429, detail="Too many uploads, slow down")


def _clean_name(name: str | None) -> str:
    n = re.sub(r"[\x00-\x1f\\/]", "_", (name or "file").strip())[-200:]
    return n or "file"


@router.post("/attachments", response_model=AttachmentOut, status_code=201)
async def upload_attachment(
    file: UploadFile = File(...),
    voice: bool = Form(False),
    duration: float | None = Form(None),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Upload first, then attach by id when sending the message. Orphans stay private to the uploader."""
    _limit_rate(me)
    if voice:
        if duration is None or not (0 < duration <= media.MAX_VOICE_SECONDS):
            raise HTTPException(status_code=422, detail="Voice messages must be 1 to 300 seconds")
    data = await _read_limited(file, media.LIMITS["voice"] if voice else media.LIMITS["video"])
    try:
        mime = media.sniff(data)
        if mime is None:
            raise MediaError(415, "This file type is not allowed")
        kind = media.classify(mime, voice)
        mime = media.effective_mime(mime, voice)
        if len(data) > media.limit_for(kind, voice):
            raise MediaError(413, f"File too large (max {media.limit_for(kind, voice) // media.MB} MB)")
        w = h = None
        thumb_key = None
        thumb = None
        if kind == AttachmentKind.image:
            data, w, h, thumb = media.process_image(data, mime)
    except MediaError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)
    storage = get_storage()
    key = new_key("attachments", media.EXT[mime])
    await storage.put(key, data, mime)
    if thumb:
        thumb_key = new_key("thumbs", "webp")
        await storage.put(thumb_key, thumb, "image/webp")
    att = Attachment(
        uploader_id=me.id, kind=kind, mime=mime, size=len(data),
        original_name=_clean_name(file.filename), storage_key=key, width=w, height=h,
        duration=duration if voice else None, thumb_key=thumb_key,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)
    return attachment_out(att)


@router.put("/users/me/avatar", response_model=UserOut)
async def set_avatar(
    file: UploadFile = File(...), db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    _limit_rate(me)
    data = await _read_limited(file, media.LIMITS["avatar"])
    try:
        out = media.process_avatar(data, media.sniff(data) or "")
    except MediaError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)
    storage = get_storage()
    key = new_key("avatars", "jpg")
    await storage.put(key, out, "image/jpeg")
    old, me.avatar_key = me.avatar_key, key
    await db.commit()
    await db.refresh(me)
    if old:
        await storage.delete(old)
    await notify.publish_user_updated(db, me)
    return me


@router.delete("/users/me/avatar", response_model=UserOut)
async def remove_avatar(db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    old, me.avatar_key = me.avatar_key, None
    await db.commit()
    await db.refresh(me)
    if old:
        await get_storage().delete(old)
    await notify.publish_user_updated(db, me)
    return me


_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


async def _serve(
    request: Request, key: str, size: int, mime: str, disposition: str, cache: str
) -> Response:
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
        "Cache-Control": cache,
    }
    start, end, status = 0, size - 1, 200
    rng = request.headers.get("range")
    if rng:
        m = _RANGE.match(rng.strip())
        if not m or (m.group(1) == "" and m.group(2) == ""):
            return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{size}"})
        a, b = m.groups()
        if a == "":  # suffix: last N bytes
            start, end = max(size - int(b), 0), size - 1
        else:
            start = int(a)
            end = min(int(b), size - 1) if b else size - 1
        if start >= size or start > end:
            return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{size}"})
        status = 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(end - start + 1)

    async def body() -> AsyncIterator[bytes]:
        async for chunk in get_storage().iter_range(key, start, end):
            yield chunk

    return StreamingResponse(body(), status_code=status, media_type=mime, headers=headers)


def _disposition(kind: AttachmentKind, name: str) -> str:
    from urllib.parse import quote

    mode = "inline" if kind in media.INLINE_KINDS else "attachment"
    ascii_name = re.sub(r'[^\x20-\x7e]|["\\]', "_", name)
    return f"{mode}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"


@router.get("/files/attachments/{att_id}")
async def download_attachment(
    att_id: int,
    request: Request,
    thumb: bool = False,
    download: bool = False,
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    att = await db.get(Attachment, att_id)
    if att is None:
        raise HTTPException(status_code=404, detail="Not found")
    if att.message_id is None:
        allowed = att.uploader_id == me.id  # not sent yet: only the uploader
    else:
        conv_id = await db.scalar(select(Message.conversation_id).where(Message.id == att.message_id))
        allowed = conv_id is not None and await chat.get_membership(db, conv_id, me.id) is not None
    if not allowed:
        raise HTTPException(status_code=404, detail="Not found")  # no oracle for attachment ids
    key, mime, kind = att.storage_key, att.mime, att.kind
    if thumb and att.thumb_key:
        key, mime, kind = att.thumb_key, "image/webp", AttachmentKind.image
    size = await get_storage().size(key)
    disp = _disposition(kind, att.original_name)
    if download:
        disp = disp.replace("inline", "attachment", 1)
    return await _serve(request, key, size, mime, disp, "private, max-age=86400")


@router.get("/files/avatars/{user_id}")
async def download_avatar(
    user_id: int, request: Request, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    user = await db.get(User, user_id)
    if user is None or not user.avatar_key:
        raise HTTPException(status_code=404, detail="Not found")
    size = await get_storage().size(user.avatar_key)
    return await _serve(
        request, user.avatar_key, size, "image/jpeg", "inline", "private, max-age=31536000, immutable"
    )
