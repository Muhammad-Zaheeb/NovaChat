"""Upload validation and processing. Content type is decided by sniffing the bytes; the
client's Content-Type and file extension are never trusted. Images are re-encoded with
Pillow (drops EXIF/GPS and any appended payload) and get a thumbnail."""
import io

from PIL import Image, ImageOps

from app.models.attachment import AttachmentKind

Image.MAX_IMAGE_PIXELS = 40_000_000  # decompression-bomb guard

MB = 1024 * 1024
LIMITS = {
    "avatar": 5 * MB,
    "image": 10 * MB,
    "video": 50 * MB,
    "voice": 5 * MB,
    "file": 25 * MB,
}
MAX_VOICE_SECONDS = 300
THUMB_SIDE = 400
IMAGE_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
VOICE_MIMES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"}
# Safe to render inline; everything else is forced to download.
INLINE_KINDS = {AttachmentKind.image, AttachmentKind.video, AttachmentKind.audio}
EXT = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3",
    "audio/wav": "wav", "application/pdf": "pdf", "application/zip": "zip", "text/plain": "txt",
}


class MediaError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail


def sniff(data: bytes) -> str | None:
    """Detected MIME type from magic bytes, or None if not on the allowlist."""
    h = data[:64]
    if h.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if h.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if h[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if h[:4] == b"RIFF" and h[8:12] == b"WEBP":
        return "image/webp"
    if h[:4] == b"RIFF" and h[8:12] == b"WAVE":
        return "audio/wav"
    if h[4:8] == b"ftyp":
        brand = h[8:12]
        if brand == b"qt  ":
            return "video/quicktime"
        if brand in (b"M4A ", b"M4B "):
            return "audio/mp4"
        return "video/mp4"
    if h[:4] == b"\x1a\x45\xdf\xa3" and b"webm" in data[:200]:
        return "video/webm"
    if h[:4] == b"OggS":
        return "audio/ogg"
    if h[:3] == b"ID3" or (len(h) > 1 and h[0] == 0xFF and h[1] & 0xE0 == 0xE0):
        return "audio/mpeg"
    if h.startswith(b"%PDF-"):
        return "application/pdf"
    if h[:4] == b"PK\x03\x04":
        return "application/zip"
    head = data[:8192]
    if head and b"\x00" not in head:
        try:
            text = head.decode("utf-8", errors="strict") if len(data) <= 8192 else head.decode(
                "utf-8", errors="ignore"
            )
        except UnicodeDecodeError:
            return None
        if not text.lstrip("﻿ \t\r\n").startswith("<"):  # no HTML/SVG/XML
            return "text/plain"
    return None


def classify(mime: str, voice: bool) -> AttachmentKind:
    if voice:
        # MediaRecorder output: Chrome webm, Safari mp4. Sniffing calls both "video/*".
        mime = {"video/webm": "audio/webm", "video/mp4": "audio/mp4"}.get(mime, mime)
        if mime not in VOICE_MIMES:
            raise MediaError(415, "Unsupported audio format")
        return AttachmentKind.audio
    if mime in IMAGE_MIMES:
        return AttachmentKind.image
    if mime.startswith("video/"):
        return AttachmentKind.video
    if mime.startswith("audio/"):
        return AttachmentKind.audio
    return AttachmentKind.file


def effective_mime(mime: str, voice: bool) -> str:
    return {"video/webm": "audio/webm", "video/mp4": "audio/mp4"}.get(mime, mime) if voice else mime


def limit_for(kind: AttachmentKind, voice: bool) -> int:
    if voice:
        return LIMITS["voice"]
    return {AttachmentKind.image: LIMITS["image"], AttachmentKind.video: LIMITS["video"]}.get(
        kind, LIMITS["file"]
    )


def _encode(im: Image.Image, fmt: str, **kw) -> bytes:
    buf = io.BytesIO()
    im.save(buf, fmt, **kw)
    return buf.getvalue()


def process_image(data: bytes, mime: str) -> tuple[bytes, int, int, bytes]:
    """Returns (re-encoded bytes, width, height, thumbnail webp bytes)."""
    try:
        im = Image.open(io.BytesIO(data))
        fmt = {"image/jpeg": "JPEG", "image/png": "PNG", "image/gif": "GIF", "image/webp": "WEBP"}[mime]
        if im.format != fmt:
            raise MediaError(400, "Corrupt image")
        animated = getattr(im, "n_frames", 1) > 1
        im.load()
        if animated:
            im.seek(0)
        im = ImageOps.exif_transpose(im)  # bake the rotation in before the EXIF is dropped
        first = im.copy()
        if animated and fmt in ("GIF", "WEBP"):
            # re-save all frames without metadata
            src = Image.open(io.BytesIO(data))
            frames = []
            for i in range(src.n_frames):
                src.seek(i)
                frames.append(src.convert("RGBA").copy())
            out = _encode(
                frames[0], fmt, save_all=True, append_images=frames[1:],
                loop=src.info.get("loop", 0), duration=src.info.get("duration", 100),
            )
        elif fmt == "JPEG":
            out = _encode(first.convert("RGB"), "JPEG", quality=88, optimize=True)
        elif fmt == "PNG":
            out = _encode(first, "PNG", optimize=True)
        elif fmt == "WEBP":
            out = _encode(first, "WEBP", quality=88)
        else:
            out = _encode(first, "GIF")
        w, h = first.size
        thumb = first.copy()
        thumb.thumbnail((THUMB_SIDE, THUMB_SIDE))
        thumb = thumb.convert("RGBA" if thumb.mode in ("RGBA", "LA", "P") else "RGB")
        return out, w, h, _encode(thumb, "WEBP", quality=80)
    except MediaError:
        raise
    except Exception:
        raise MediaError(400, "Could not read this image")


def process_avatar(data: bytes, mime: str) -> bytes:
    """Centre-crop to a square, 512px, JPEG, no metadata."""
    if mime not in IMAGE_MIMES:
        raise MediaError(415, "Profile picture must be a JPEG, PNG, GIF or WebP image")
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
        im.load()
        side = min(im.size)
        l, t = (im.width - side) // 2, (im.height - side) // 2
        im = im.crop((l, t, l + side, t + side)).resize((512, 512), Image.LANCZOS)
        if im.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[3])
            im = bg
        return _encode(im.convert("RGB"), "JPEG", quality=88, optimize=True)
    except Exception:
        raise MediaError(400, "Could not read this image")
