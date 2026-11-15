import asyncio
import json
from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
import uvicorn
from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus

from app.main import app

ORIGIN = "http://localhost:5173"


@pytest_asyncio.fixture
async def ws_url():
    """Real server on the test event loop, so the async DB engine is shared with the tests."""
    server = uvicorn.Server(uvicorn.Config(app, port=0, log_level="warning", lifespan="off"))
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.01)
    port = server.servers[0].sockets[0].getsockname()[1]
    yield f"ws://127.0.0.1:{port}/ws"
    server.should_exit = True
    await task


@asynccontextmanager
async def open_ws(url, client, origin=ORIGIN):
    cookie = client.cookies.get("access_token")
    async with connect(
        url, additional_headers={"Cookie": f"access_token={cookie}", "Origin": origin}
    ) as ws:
        yield ws


async def send(ws, type_, **payload):
    await ws.send(json.dumps({"type": type_, "payload": payload}))


async def recv(ws, timeout=2):
    return json.loads(await asyncio.wait_for(ws.recv(), timeout))


async def silent(ws, timeout=0.4):
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(ws.recv(), timeout)


async def dm(users, a="alice", b="bob"):
    r = await users[a].post("/conversations/direct", json={"user_id": users[b].user_id})
    return r.json()["id"]


async def test_missing_or_bad_cookie_rejected(ws_url):
    for headers in ({}, {"Cookie": "access_token=garbage"}):
        with pytest.raises(InvalidStatus):
            async with connect(ws_url, additional_headers=headers):
                pass


async def test_foreign_origin_rejected(ws_url, users):
    with pytest.raises(InvalidStatus):
        async with open_ws(ws_url, users["alice"], origin="http://evil.example"):
            pass


async def test_ping_pong_and_bad_input(ws_url, users):
    async with open_ws(ws_url, users["alice"]) as ws:
        await send(ws, "ping")
        assert (await recv(ws))["type"] == "pong"
        await ws.send("not json")
        assert (await recv(ws))["payload"]["code"] == "bad_request"
        await send(ws, "nope")
        assert (await recv(ws))["payload"]["code"] == "unknown_event"
        await send(ws, "message.send", conversation_id="x", content="")
        assert (await recv(ws))["payload"]["code"] == "invalid_payload"
        await send(ws, "ping")  # socket still alive
        assert (await recv(ws))["type"] == "pong"


async def test_message_reaches_member_not_outsider(ws_url, users):
    conv = await dm(users)
    async with open_ws(ws_url, users["alice"]) as a, open_ws(ws_url, users["bob"]) as b, \
            open_ws(ws_url, users["mallory"]) as m:
        await recv(a)  # presence: bob online
        await send(a, "message.send", conversation_id=conv, content="hi", client_id="c1")
        for ws in (a, b):
            ev = await recv(ws)
            assert ev["type"] == "message.new"
            assert ev["payload"]["content"] == "hi"
            assert ev["payload"]["client_id"] == "c1"
        await silent(m)
    r = await users["alice"].get(f"/conversations/{conv}/messages")
    assert [x["content"] for x in r.json()] == ["hi"]  # persisted


async def test_multi_tab_receives_on_both(ws_url, users):
    conv = await dm(users)
    async with open_ws(ws_url, users["bob"]) as b1, open_ws(ws_url, users["bob"]) as b2:
        r = await users["alice"].post(f"/conversations/{conv}/messages", json={"content": "yo"})
        assert r.status_code == 201
        for ws in (b1, b2):
            assert (await recv(ws))["payload"]["content"] == "yo"


async def test_non_member_send_errors(ws_url, users):
    conv = await dm(users)
    async with open_ws(ws_url, users["mallory"]) as m:
        await send(m, "message.send", conversation_id=conv, content="x")
        ev = await recv(m)
        assert ev["type"] == "error" and ev["payload"]["code"] == "not_found"
    assert (await users["alice"].get(f"/conversations/{conv}/messages")).json() == []


async def test_typing_reaches_others_not_sender_and_is_rate_limited(ws_url, users):
    conv = await dm(users)
    async with open_ws(ws_url, users["alice"]) as a, open_ws(ws_url, users["bob"]) as b:
        await recv(a)  # presence
        await send(a, "typing.start", conversation_id=conv)
        await send(a, "typing.start", conversation_id=conv)  # throttled
        ev = await recv(b)
        assert ev["type"] == "typing" and ev["payload"] == {
            "conversation_id": conv, "user_id": users["alice"].user_id, "is_typing": True}
        await send(a, "typing.stop", conversation_id=conv)
        assert (await recv(b))["payload"]["is_typing"] is False
        await silent(b)
        await silent(a)


async def test_read_receipt_via_ws_and_rest(ws_url, users):
    conv = await dm(users)
    m = (await users["alice"].post(f"/conversations/{conv}/messages", json={"content": "a"})).json()
    async with open_ws(ws_url, users["alice"]) as a, open_ws(ws_url, users["bob"]) as b:
        await recv(a)  # presence
        await send(b, "message.read", conversation_id=conv, message_id=m["id"])
        ev = await recv(a)
        assert ev["type"] == "message.read"
        assert ev["payload"]["user_id"] == users["bob"].user_id
        assert ev["payload"]["message_id"] == m["id"]
        await recv(b)  # own tabs get it too
        await users["bob"].post(f"/conversations/{conv}/read", json={"message_id": m["id"]})
        assert (await recv(a))["type"] == "message.read"


async def test_presence_online_offline(ws_url, users):
    conv = await dm(users)
    async with open_ws(ws_url, users["alice"]) as a:
        bid = users["bob"].user_id
        r = await users["alice"].get(f"/users/online?ids={bid}")
        assert r.json() == {"online": []}
        async with open_ws(ws_url, users["bob"]) as b1:
            ev = await recv(a)
            assert ev == {"type": "presence", "payload": {"user_id": bid, "online": True}}
            async with open_ws(ws_url, users["bob"]):  # second tab: no new event
                await silent(a)
            await silent(a)  # still online with one tab left
            assert (await users["alice"].get(f"/users/online?ids={bid}")).json() == {"online": [bid]}
        ev = await recv(a)
        assert ev["payload"] == {"user_id": bid, "online": False}
    assert conv


async def recv_type(ws, type_, timeout=2):
    """Next event of `type_`, skipping others (e.g. presence)."""
    while True:
        ev = await recv(ws, timeout)
        if ev["type"] == type_:
            return ev


async def test_group_membership_events(ws_url, users):
    a, b, c = users["alice"], users["bob"], users["carol"]
    g = (await a.post("/conversations/group", json={"name": "G", "member_ids": [b.user_id]})).json()["id"]
    async with open_ws(ws_url, a) as wa, open_ws(ws_url, b) as wb, open_ws(ws_url, c) as wc:
        # add carol: members and the added user hear about it
        assert (await a.post(f"/conversations/{g}/members", json={"user_id": c.user_id})).status_code == 201
        for ws in (wa, wb, wc):
            p = (await recv_type(ws, "conversation.updated"))["payload"]
            assert p == {"conversation_id": g, "change": "member_added", "user_id": c.user_id}
        # remove carol: she still hears it (she was just removed)
        assert (await a.delete(f"/conversations/{g}/members/{c.user_id}")).status_code == 204
        for ws in (wa, wb, wc):
            p = (await recv_type(ws, "conversation.updated"))["payload"]
            assert p["change"] == "member_removed" and p["user_id"] == c.user_id
        # bob leaves: remaining member and bob are told
        assert (await b.delete(f"/conversations/{g}/members/{b.user_id}")).status_code == 204
        for ws in (wa, wb):
            p = (await recv_type(ws, "conversation.updated"))["payload"]
            assert p["change"] == "member_left" and p["user_id"] == b.user_id
        await silent(wc)
