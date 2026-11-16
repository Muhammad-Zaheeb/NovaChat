from tests.conftest import register_login
from tests.test_ws import open_ws, recv_type, ws_url  # noqa: F401


async def fresh(*names):
    return [await register_login(n) for n in names]


async def req(a, b):
    return await a.post("/friends/requests", json={"user_id": b.user_id})


async def test_request_accept_list_unfriend():
    a, b = await fresh("alice", "bob")
    r = await req(a, b)
    assert r.status_code == 201 and r.json()["status"] == "pending"
    rid = r.json()["id"]
    assert (await req(a, b)).status_code == 409  # duplicate
    assert (await req(b, b)).status_code == 400 and (await a.post("/friends/requests", json={"user_id": a.user_id})).status_code == 400
    inc = (await b.get("/friends/requests")).json()
    assert [x["id"] for x in inc["incoming"]] == [rid] and inc["outgoing"] == []
    assert [x["id"] for x in (await a.get("/friends/requests")).json()["outgoing"]] == [rid]
    assert (await a.post(f"/friends/requests/{rid}/accept")).status_code == 404  # only the addressee
    assert (await b.post(f"/friends/requests/{rid}/accept")).status_code == 200
    assert [f["username"] for f in (await a.get("/friends")).json()] == ["bob"]
    assert [f["username"] for f in (await b.get("/friends")).json()] == ["alice"]
    assert (await req(b, a)).status_code == 409  # already friends
    assert (await a.delete(f"/friends/{b.user_id}")).status_code == 204
    assert (await a.get("/friends")).json() == []
    assert (await a.delete(f"/friends/{b.user_id}")).status_code == 404


async def test_mutual_request_auto_accepts():
    a, b = await fresh("alice", "bob")
    await req(a, b)
    r = await req(b, a)
    assert r.status_code == 201 and r.json()["status"] == "accepted"
    assert len((await a.get("/friends")).json()) == 1


async def test_decline_cancel_and_resend():
    a, b = await fresh("alice", "bob")
    rid = (await req(a, b)).json()["id"]
    assert (await b.post(f"/friends/requests/{rid}/decline")).status_code == 200
    assert (await b.get("/friends/requests")).json()["incoming"] == []
    r = await req(a, b)  # a declined request can be re-sent immediately
    assert r.status_code == 201 and r.json()["status"] == "pending"
    rid = r.json()["id"]
    assert (await b.delete(f"/friends/requests/{rid}")).status_code == 404  # only requester cancels
    assert (await a.delete(f"/friends/requests/{rid}")).status_code == 204
    assert (await b.get("/friends/requests")).json()["incoming"] == []
    assert (await req(b, a)).status_code == 201


async def test_search_friendship_status():
    a, b, c, d = await fresh("alice", "bob", "carol", "dave")
    await req(a, b)  # pending a->b
    rid = (await req(c, a)).json()["id"]  # pending c->a
    await req(a, d)
    await d.post(f"/friends/requests/{(await d.get('/friends/requests')).json()['incoming'][0]['id']}/accept")
    for q, want in (("bob", "pending_outgoing"), ("carol", "pending_incoming")):
        res = {u["username"]: u["friendship_status"] for u in (await a.get("/users/search", params={"q": q})).json()["items"]}
        assert res == {q: want}
    res = {u["username"]: u["friendship_status"] for u in (await a.get("/users/search", params={"q": "dave"})).json()["items"]}
    assert res == {"dave": "friends"}
    assert rid


async def test_non_friend_cannot_dm_or_be_added():
    a, b, c = await fresh("alice", "bob", "carol")
    r = await a.post("/conversations/direct", json={"user_id": b.user_id})
    assert r.status_code == 403 and r.json()["detail"] == "not_friends"
    r = await a.post("/conversations/group", json={"name": "g", "member_ids": [b.user_id]})
    assert r.status_code == 403
    # friends: allowed
    rid = (await req(a, b)).json()["id"]
    await b.post(f"/friends/requests/{rid}/accept")
    assert (await a.post("/conversations/direct", json={"user_id": b.user_id})).status_code == 200
    g = (await a.post("/conversations/group", json={"name": "g", "member_ids": [b.user_id]})).json()["id"]
    r = await a.post(f"/conversations/{g}/members", json={"user_id": c.user_id})
    assert r.status_code == 403 and r.json()["detail"] == "not_friends"
    rid = (await req(a, c)).json()["id"]
    await c.post(f"/friends/requests/{rid}/accept")
    assert (await a.post(f"/conversations/{g}/members", json={"user_id": c.user_id})).status_code == 201


async def test_existing_dm_survives_unfriend():
    a, b = await fresh("alice", "bob")
    rid = (await req(a, b)).json()["id"]
    await b.post(f"/friends/requests/{rid}/accept")
    conv = (await a.post("/conversations/direct", json={"user_id": b.user_id})).json()["id"]
    await a.delete(f"/friends/{b.user_id}")
    r = await a.post("/conversations/direct", json={"user_id": b.user_id})
    assert r.status_code == 200 and r.json()["id"] == conv
    assert (await a.post(f"/conversations/{conv}/messages", json={"content": "hi"})).status_code == 201


async def test_friend_events(ws_url):
    a, b = await fresh("alice", "bob")
    async with open_ws(ws_url, a) as wa, open_ws(ws_url, b) as wb:
        rid = (await req(a, b)).json()["id"]
        p = (await recv_type(wb, "friend.request"))["payload"]
        assert p["id"] == rid and p["user"]["username"] == "alice"
        await b.post(f"/friends/requests/{rid}/accept")
        p = (await recv_type(wa, "friend.accepted"))["payload"]
        assert p["user"]["username"] == "bob"
        await b.delete(f"/friends/{a.user_id}")
        p = (await recv_type(wa, "friend.removed"))["payload"]
        assert p["user_id"] == b.user_id
        # cancel is announced to the addressee
        rid = (await req(a, b)).json()["id"]
        await recv_type(wb, "friend.request")
        await a.delete(f"/friends/requests/{rid}")
        assert (await recv_type(wb, "friend.removed"))["payload"]["request_id"] == rid
