import io

import pytest
from PIL import Image

from app.core.config import settings
from app.services import media
from tests.test_ws import ws_url  # noqa: F401


def png(size=(64, 48), color=(200, 30, 30)) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", size, color).save(b, "PNG")
    return b.getvalue()


def jpeg_with_exif() -> bytes:
    im = Image.new("RGB", (40, 30), (10, 120, 200))
    exif = Image.Exif()
    exif[0x010F] = "SecretCamera"  # Make
    exif[0x8825] = {1: "N", 2: (31.0, 0.0, 0.0)}  # GPS IFD
    b = io.BytesIO()
    im.save(b, "JPEG", exif=exif)
    return b.getvalue()


async def upload(c, data: bytes, name="x.bin", ctype="application/octet-stream", **form):
    return await c.post("/attachments", files={"file": (name, data, ctype)}, data=form)


async def dm(users, a="alice", b="bob") -> int:
    r = await users[a].post("/conversations/direct", json={"user_id": users[b].user_id})
    return r.json()["id"]


async def test_upload_requires_auth(client):
    assert (await upload(client, png())).status_code == 401
    assert (await client.get("/files/attachments/1")).status_code == 401
    assert (await client.get("/files/avatars/1")).status_code == 401


async def test_image_upload_reencoded_with_thumbnail(users):
    r = await upload(users["alice"], png((1000, 500)), "../../evil name.png", "text/html")
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["kind"] == "image" and a["mime"] == "image/png" and (a["width"], a["height"]) == (1000, 500)
    assert a["thumb_url"] and "/" not in a["original_name"].replace("_", "")
    t = await users["alice"].get(a["thumb_url"])
    assert t.status_code == 200 and t.headers["content-type"] == "image/webp"
    assert max(Image.open(io.BytesIO(t.content)).size) <= 400


async def test_exif_and_gps_stripped(users):
    src = jpeg_with_exif()
    assert Image.open(io.BytesIO(src)).getexif()  # sanity: source has EXIF
    a = (await upload(users["alice"], src, "p.jpg", "image/jpeg")).json()
    out = (await users["alice"].get(a["url"])).content
    im = Image.open(io.BytesIO(out))
    assert not dict(im.getexif()) and b"SecretCamera" not in out and b"Exif" not in out


@pytest.mark.parametrize("name,data,ctype", [
    ("a.png", b"<html><script>alert(1)</script></html>", "image/png"),
    ("a.svg", b'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', "image/svg+xml"),
    ("a.png", b"<?xml version='1.0'?><svg/>", "image/png"),
    ("a.exe", b"MZ\x90\x00\x03\x00\x00\x00binary", "application/pdf"),
    ("a.bin", bytes(range(256)) * 4, "application/octet-stream"),
])
async def test_sniffing_rejects_disguised_or_disallowed(users, name, data, ctype):
    r = await upload(users["alice"], data, name, ctype)
    assert r.status_code == 415, r.text


async def test_truncated_image_rejected(users):
    r = await upload(users["alice"], png()[:30], "a.png", "image/png")
    assert r.status_code == 400


async def test_allowed_generic_files_and_classification(users):
    c = users["alice"]
    pdf = (await upload(c, b"%PDF-1.4\n%fake", "doc.pdf", "text/plain")).json()
    assert pdf["kind"] == "file" and pdf["mime"] == "application/pdf"
    txt = (await upload(c, b"hello world\n", "n.txt")).json()
    assert txt["mime"] == "text/plain"
    vid = (await upload(c, b"\x00\x00\x00\x18ftypmp42" + b"\0" * 64, "v.mp4")).json()
    assert vid["kind"] == "video"


async def test_size_limits(users, monkeypatch):
    c = users["alice"]
    # file limit (25 MB): a PDF header + padding
    big = b"%PDF-1.4\n" + b"0" * (25 * media.MB)
    assert (await upload(c, big, "b.pdf")).status_code == 413
    # image limit (10 MB) applies after sniffing
    img = png() + b"0" * (10 * media.MB)
    assert (await upload(c, img, "b.png")).status_code == 413
    # avatar 5 MB
    r = await c.put("/users/me/avatar", files={"file": ("a.png", png() + b"0" * (5 * media.MB), "image/png")})
    assert r.status_code == 413
    # voice 5 MB and duration bounds
    webm = b"\x1a\x45\xdf\xa3" + b"\x93\x42\x82\x84webm" + b"0" * (5 * media.MB)
    assert (await upload(c, webm, "v.webm", voice="true", duration="5")).status_code == 413
    ok = b"\x1a\x45\xdf\xa3" + b"\x93\x42\x82\x84webm" + b"0" * 100
    assert (await upload(c, ok, "v.webm", voice="true", duration="301")).status_code == 422
    assert (await upload(c, ok, "v.webm", voice="true")).status_code == 422
    r = await upload(c, ok, "v.webm", voice="true", duration="12.5")
    assert r.status_code == 201 and r.json()["kind"] == "audio" and r.json()["mime"] == "audio/webm"
    assert r.json()["duration"] == 12.5
    # a PDF is not a voice message
    assert (await upload(c, b"%PDF-1.4 x", "v.webm", voice="true", duration="3")).status_code == 415


async def test_upload_rate_limit(users, monkeypatch):
    monkeypatch.setattr(settings, "UPLOADS_PER_MINUTE", 2)
    c = users["alice"]
    assert (await upload(c, b"hello", "a.txt")).status_code == 201
    assert (await upload(c, b"hello", "a.txt")).status_code == 201
    assert (await upload(c, b"hello", "a.txt")).status_code == 429
    assert (await upload(users["bob"], b"hello", "a.txt")).status_code == 201  # per user


async def test_download_membership_headers_and_delete(users):
    cid = await dm(users)
    a = (await upload(users["alice"], b"%PDF-1.4 hi", "../résumé.pdf")).json()
    # unsent: only the uploader
    assert (await users["bob"].get(a["url"])).status_code == 404
    assert (await users["alice"].get(a["url"])).status_code == 200
    r = await users["alice"].post(f"/conversations/{cid}/messages", json={"attachment_ids": [a["id"]], "content": "cv"})
    assert r.status_code == 201, r.text
    msg = r.json()
    assert msg["type"] == "file" and msg["content"] == "cv" and msg["attachments"][0]["id"] == a["id"]
    # reuse is refused
    r2 = await users["alice"].post(f"/conversations/{cid}/messages", json={"attachment_ids": [a["id"]]})
    assert r2.status_code == 400
    # member can download; PDFs are forced to download and not sniffable
    d = await users["bob"].get(a["url"])
    assert d.status_code == 200 and d.content == b"%PDF-1.4 hi"
    assert d.headers["content-disposition"].startswith("attachment;")
    assert d.headers["x-content-type-options"] == "nosniff"
    # non-member denied
    assert (await users["carol"].get(a["url"])).status_code == 404
    # someone else's upload can't be attached by another user
    b = (await upload(users["bob"], b"hello", "b.txt")).json()
    r3 = await users["alice"].post(f"/conversations/{cid}/messages", json={"attachment_ids": [b["id"]]})
    assert r3.status_code == 400
    # delete removes the files and the rows
    import os
    from app.core.storage import get_storage
    root = get_storage().root
    assert any(p.is_file() for p in root.rglob("*.pdf"))
    r = await users["alice"].delete(f"/conversations/{cid}/messages/{msg['id']}")
    assert r.status_code == 200 and r.json()["attachments"] == []
    assert not any(p.is_file() for p in root.rglob("*.pdf"))
    assert (await users["bob"].get(a["url"])).status_code == 404


async def test_inline_for_media_and_range_requests(users):
    cid = await dm(users)
    data = b"\x00\x00\x00\x18ftypmp42" + bytes(range(256)) * 4
    a = (await upload(users["alice"], data, "clip.mp4")).json()
    await users["alice"].post(f"/conversations/{cid}/messages", json={"attachment_ids": [a["id"]]})
    bob = users["bob"]
    full = await bob.get(a["url"])
    assert full.status_code == 200 and full.headers["accept-ranges"] == "bytes"
    assert full.headers["content-disposition"].startswith("inline;") and full.content == data
    r = await bob.get(a["url"], headers={"Range": "bytes=10-19"})
    assert r.status_code == 206 and r.content == data[10:20]
    assert r.headers["content-range"] == f"bytes 10-19/{len(data)}"
    r = await bob.get(a["url"], headers={"Range": "bytes=1000-"})
    assert r.status_code == 206 and r.content == data[1000:]
    r = await bob.get(a["url"], headers={"Range": "bytes=-16"})
    assert r.status_code == 206 and r.content == data[-16:]
    assert (await bob.get(a["url"], headers={"Range": "bytes=99999-"})).status_code == 416
    assert (await bob.get(a["url"], headers={"Range": "bytes=abc"})).status_code == 416
    assert (await bob.get(a["url"] + "?download=1")).headers["content-disposition"].startswith("attachment;")


async def test_voice_message(users):
    cid = await dm(users)
    ok = b"\x1a\x45\xdf\xa3" + b"\x93\x42\x82\x84webm" + b"0" * 100
    a = (await upload(users["alice"], ok, "voice.webm", voice="true", duration="7")).json()
    r = await users["alice"].post(f"/conversations/{cid}/messages", json={"attachment_ids": [a["id"]]})
    assert r.json()["type"] == "voice" and r.json()["content"] == ""
    # empty message without attachments is still invalid
    assert (await users["alice"].post(f"/conversations/{cid}/messages", json={"content": "  "})).status_code == 422


async def test_avatar_flow(users):
    a, b = users["alice"], users["bob"]
    r = await a.put("/users/me/avatar", files={"file": ("me.png", png((300, 100)), "image/png")})
    assert r.status_code == 200, r.text
    url = r.json()["avatar_url"]
    assert url.startswith(f"/files/avatars/{a.user_id}?v=")
    got = await b.get(url)  # any logged-in user may fetch
    assert got.status_code == 200 and got.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(got.content)).size == (512, 512)
    # shown on public profile shapes
    members = (await b.get("/friends")).json()
    assert [f for f in members if f["id"] == a.user_id][0]["avatar_url"] == url
    # replacing deletes the old file; non-images are refused
    assert (await a.put("/users/me/avatar", files={"file": ("x.png", b"<html>", "image/png")})).status_code == 415
    r = await a.delete("/users/me/avatar")
    assert r.json()["avatar_url"] is None and (await b.get(url)).status_code == 404


async def test_avatar_and_attachment_message_broadcast(ws_url, users):
    from tests.test_ws import open_ws, recv
    cid = await dm(users)
    async with open_ws(ws_url, users["bob"]) as ws:
        a = users["alice"]
        r = await a.put("/users/me/avatar", files={"file": ("me.png", png(), "image/png")})
        seen = {}
        while "user.updated" not in seen:
            ev = await recv(ws)
            seen[ev["type"]] = ev["payload"]
        assert seen["user.updated"]["avatar_url"] == r.json()["avatar_url"]
        att = (await upload(a, png(), "p.png")).json()
        await a.post(f"/conversations/{cid}/messages", json={"attachment_ids": [att["id"]]})
        while True:
            ev = await recv(ws)
            if ev["type"] == "message.new":
                break
        assert ev["payload"]["attachments"][0]["id"] == att["id"]


async def test_reply_preview_carries_attachment(users):
    cid = await dm(users)
    att = (await upload(users["alice"], png(), "p.png")).json()
    m = (await users["alice"].post(f"/conversations/{cid}/messages", json={"attachment_ids": [att["id"]]})).json()
    r = await users["bob"].post(f"/conversations/{cid}/messages", json={"content": "nice", "reply_to_id": m["id"]})
    assert r.json()["reply_to"]["attachments"][0]["kind"] == "image"
    lst = (await users["bob"].get("/conversations")).json()
    assert lst[0]["last_message"]["content"] == "nice"
