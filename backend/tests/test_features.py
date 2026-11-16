from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.database.engine import engine
from app.models.message import Message
from tests.test_ws import dm, open_ws, recv, send, ws_url  # noqa: F401

from sqlalchemy.ext.asyncio import AsyncSession


async def say(c, conv, text, **kw):
    r = await c.post(f"/conversations/{conv}/messages", json={"content": text, **kw})
    assert r.status_code == 201, r.text
    return r.json()


async def test_reply(users):
    conv = await dm(users)
    m1 = await say(users["alice"], conv, "hello there")
    m2 = await say(users["bob"], conv, "hi", reply_to_id=m1["id"])
    assert m2["reply_to"] == {"id": m1["id"], "sender_id": users["alice"].user_id, "content": "hello there", "deleted": False}
    listed = (await users["alice"].get(f"/conversations/{conv}/messages")).json()
    assert listed[0]["reply_to"]["id"] == m1["id"]
    # reply target from another conversation / missing is rejected
    other = (await users["alice"].post("/conversations/direct", json={"user_id": users["carol"].user_id})).json()["id"]
    r = await users["alice"].post(f"/conversations/{other}/messages", json={"content": "x", "reply_to_id": m1["id"]})
    assert r.status_code == 404


async def test_edit_rules(users):
    conv = await dm(users)
    m = await say(users["alice"], conv, "oops")
    url = f"/conversations/{conv}/messages/{m['id']}"
    assert (await users["bob"].patch(url, json={"content": "hack"})).status_code == 403
    r = await users["alice"].patch(url, json={"content": "fixed"})
    assert r.status_code == 200 and r.json()["content"] == "fixed" and r.json()["edited_at"]
    assert (await users["alice"].patch(url, json={"content": ""})).status_code == 422
    # past the 15 minute window
    old = datetime.now(timezone.utc) - timedelta(minutes=16)
    async with AsyncSession(engine) as s:
        await s.execute(update(Message).where(Message.id == m["id"]).values(created_at=old))
        await s.commit()
    assert (await users["alice"].patch(url, json={"content": "too late"})).status_code == 403
    assert (await users["mallory"].patch(url, json={"content": "x"})).status_code == 404


async def test_delete_tombstone(users):
    conv = await dm(users)
    m = await say(users["alice"], conv, "secret")
    url = f"/conversations/{conv}/messages/{m['id']}"
    assert (await users["bob"].delete(url)).status_code == 403
    r = await users["alice"].delete(url)
    assert r.status_code == 200 and r.json()["deleted"] and r.json()["content"] == ""
    assert (await users["alice"].delete(url)).status_code == 200  # idempotent
    listed = (await users["bob"].get(f"/conversations/{conv}/messages")).json()
    assert listed[0]["deleted"] and listed[0]["content"] == ""
    assert (await users["alice"].patch(url, json={"content": "x"})).status_code == 409
    # replies to a deleted message show it as deleted
    m2 = await say(users["bob"], conv, "re", reply_to_id=m["id"])
    assert m2["reply_to"]["deleted"] and m2["reply_to"]["content"] == ""


async def test_reactions_toggle(users):
    conv = await dm(users)
    m = await say(users["alice"], conv, "hi")
    url = f"/conversations/{conv}/messages/{m['id']}/reactions"
    a, b = users["alice"].user_id, users["bob"].user_id
    r = await users["alice"].post(url, json={"emoji": "👍"})
    assert r.json()["reactions"] == [{"emoji": "👍", "user_ids": [a]}]
    r = await users["bob"].post(url, json={"emoji": "👍"})
    assert r.json()["reactions"] == [{"emoji": "👍", "user_ids": [a, b]}]
    r = await users["alice"].post(url, json={"emoji": "👍"})  # toggle off
    assert r.json()["reactions"] == [{"emoji": "👍", "user_ids": [b]}]
    assert (await users["alice"].post(url, json={"emoji": "💩"})).status_code == 400
    assert (await users["mallory"].post(url, json={"emoji": "👍"})).status_code == 404


async def test_search(users):
    conv = await dm(users)
    await say(users["alice"], conv, "Pizza tonight?")
    await say(users["bob"], conv, "100% yes")
    gone = await say(users["bob"], conv, "pizza deleted")
    await users["bob"].delete(f"/conversations/{conv}/messages/{gone['id']}")
    r = await users["alice"].get(f"/conversations/{conv}/messages", params={"q": "PIZZA"})
    assert [m["content"] for m in r.json()] == ["Pizza tonight?"]
    r = await users["alice"].get(f"/conversations/{conv}/messages", params={"q": "%"})
    assert [m["content"] for m in r.json()] == ["100% yes"]  # wildcard escaped
    r = await users["mallory"].get(f"/conversations/{conv}/messages", params={"q": "pizza"})
    assert r.status_code == 404


async def test_profile(users):
    c = users["alice"]
    r = await c.patch("/users/me", json={"display_name": " Alice A ", "bio": "hello"})
    assert r.status_code == 200 and r.json()["display_name"] == "Alice A"
    assert (await c.get("/auth/me")).json()["bio"] == "hello"
    assert (await c.patch("/users/me", json={"bio": "x" * 201})).status_code == 422
    conv = await dm(users)
    members = (await users["bob"].get(f"/conversations/{conv}")).json()["members"]
    assert {m["user"]["display_name"] for m in members} == {"Alice A", None}
    friends = (await users["bob"].get("/friends")).json()
    assert [f for f in friends if f["username"] == "alice"][0]["display_name"] == "Alice A"
    r = await c.patch("/users/me", json={"display_name": "", "bio": ""})
    assert r.json()["display_name"] is None


async def test_mute_and_read_state(users):
    conv = await dm(users)
    m = await say(users["alice"], conv, "x")
    c = users["bob"]
    assert (await c.get("/conversations")).json()[0]["muted"] is False
    assert (await c.put(f"/conversations/{conv}/mute", json={"muted": True})).status_code == 200
    d = (await c.get(f"/conversations/{conv}")).json()
    assert d["muted"] is True and d["last_read_message_id"] is None and d["unread_count"] == 1
    assert (await users["alice"].get(f"/conversations/{conv}")).json()["muted"] is False
    await c.post(f"/conversations/{conv}/read", json={"message_id": m["id"]})
    assert (await c.get("/conversations")).json()[0]["last_read_message_id"] == m["id"]
    assert (await users["mallory"].put(f"/conversations/{conv}/mute", json={"muted": True})).status_code == 404


async def test_live_events(ws_url, users):  # noqa: F811
    conv = await dm(users)
    m = await say(users["alice"], conv, "hey")
    async with open_ws(ws_url, users["bob"]) as b:
        await users["alice"].patch(f"/conversations/{conv}/messages/{m['id']}", json={"content": "hey!"})
        ev = await recv(b)
        assert ev["type"] == "message.updated" and ev["payload"]["content"] == "hey!" and ev["payload"]["edited_at"]
        await users["alice"].post(f"/conversations/{conv}/messages/{m['id']}/reactions", json={"emoji": "🙏"})
        ev = await recv(b)
        assert ev["type"] == "message.updated" and ev["payload"]["reactions"][0]["emoji"] == "🙏"
        await users["alice"].delete(f"/conversations/{conv}/messages/{m['id']}")
        ev = await recv(b)
        assert ev["payload"]["deleted"] is True
        await users["alice"].patch("/users/me", json={"display_name": "Al"})
        ev = await recv(b)
        assert ev["type"] == "user.updated" and ev["payload"]["display_name"] == "Al"
        # ws send with a reply
        await send(b, "message.send", conversation_id=conv, content="r", reply_to_id=m["id"])
        ev = await recv(b)
        assert ev["type"] == "message.new" and ev["payload"]["reply_to"]["id"] == m["id"]


async def test_mute_event_only_to_self(ws_url, users):  # noqa: F811
    conv = await dm(users)
    async with open_ws(ws_url, users["bob"]) as b:
        await users["bob"].put(f"/conversations/{conv}/mute", json={"muted": True})
        ev = await recv(b)
        assert ev == {"type": "conversation.muted", "payload": {"conversation_id": conv, "muted": True}}


async def test_members_do_not_expose_email(users):
    conv = await dm(users)
    detail = (await users["bob"].get(f"/conversations/{conv}")).json()
    for m in detail["members"]:
        assert set(m["user"]) == {"id", "username", "display_name", "bio", "last_seen_at"}
    group = await users["alice"].post(
        "/conversations/group", json={"name": "g", "member_ids": [users["bob"].user_id]}
    )
    assert group.status_code in (200, 201), group.text
    gd = (await users["bob"].get(f"/conversations/{group.json()['id']}")).json()
    assert all("email" not in m["user"] for m in gd["members"])
    # your own email is still available to you
    assert "email" in (await users["bob"].get("/auth/me")).json()
