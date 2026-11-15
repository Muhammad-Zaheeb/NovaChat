async def dm(a, b):
    r = await a.post("/conversations/direct", json={"user_id": b.user_id})
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def group(owner, *members, name="team"):
    r = await owner.post(
        "/conversations/group", json={"name": name, "member_ids": [m.user_id for m in members]}
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_dm_idempotent(users):
    a, b = users["alice"], users["bob"]
    first = await dm(a, b)
    assert await dm(a, b) == first
    assert await dm(b, a) == first


async def test_dm_with_self(users):
    a = users["alice"]
    r = await a.post("/conversations/direct", json={"user_id": a.user_id})
    assert r.status_code == 400


async def test_group_create_and_roles(users):
    a, b, c = users["alice"], users["bob"], users["carol"]
    gid = await group(a, b, c)
    detail = (await a.get(f"/conversations/{gid}")).json()
    roles = {m["user"]["username"]: m["role"] for m in detail["members"]}
    assert roles == {"alice": "admin", "bob": "member", "carol": "member"}


async def test_member_removal_admin_vs_non_admin(users):
    a, b, c = users["alice"], users["bob"], users["carol"]
    gid = await group(a, b, c)
    assert (await b.delete(f"/conversations/{gid}/members/{c.user_id}")).status_code == 403
    assert (await a.delete(f"/conversations/{gid}/members/{c.user_id}")).status_code == 204
    assert (await c.get(f"/conversations/{gid}")).status_code == 404


async def test_leave_group(users):
    a, b = users["alice"], users["bob"]
    gid = await group(a, b)
    assert (await b.delete(f"/conversations/{gid}/members/{b.user_id}")).status_code == 204
    assert (await b.get(f"/conversations/{gid}/messages")).status_code == 404
    # sole admin leaves -> remaining member is promoted
    gid2 = await group(a, b, name="g2")
    assert (await a.delete(f"/conversations/{gid2}/members/{a.user_id}")).status_code == 204
    detail = (await b.get(f"/conversations/{gid2}")).json()
    assert [(m["user"]["username"], m["role"]) for m in detail["members"]] == [("bob", "admin")]


async def test_non_member_cannot_read_or_post(users):
    a, b, m = users["alice"], users["bob"], users["mallory"]
    cid = await dm(a, b)
    await a.post(f"/conversations/{cid}/messages", json={"content": "secret"})
    assert (await m.get(f"/conversations/{cid}/messages")).status_code == 404
    assert (await m.post(f"/conversations/{cid}/messages", json={"content": "hi"})).status_code == 404
    assert (await m.get(f"/conversations/{cid}")).status_code == 404
    assert (await m.post(f"/conversations/{cid}/read", json={"message_id": 1})).status_code == 404
    assert (await m.get("/conversations")).json() == []
    msgs = (await a.get(f"/conversations/{cid}/messages")).json()
    assert [x["content"] for x in msgs] == ["secret"]  # mallory's post didn't land


async def test_unauthenticated(client):
    assert (await client.get("/conversations")).status_code == 401
    assert (await client.get("/users/search?q=ab")).status_code == 401


async def test_message_pagination(users):
    a, b = users["alice"], users["bob"]
    cid = await dm(a, b)
    ids = []
    for i in range(5):
        r = await a.post(f"/conversations/{cid}/messages", json={"content": f"m{i}"})
        ids.append(r.json()["id"])
    page1 = (await b.get(f"/conversations/{cid}/messages?limit=2")).json()
    assert [m["id"] for m in page1] == ids[:-3:-1]  # newest first
    page2 = (await b.get(f"/conversations/{cid}/messages?limit=2&before={page1[-1]['id']}")).json()
    assert [m["id"] for m in page2] == ids[1:3][::-1]
    page3 = (await b.get(f"/conversations/{cid}/messages?limit=2&before={page2[-1]['id']}")).json()
    assert [m["id"] for m in page3] == [ids[0]]


async def test_user_search(users):
    a = users["alice"]
    r = await a.get("/users/search?q=ALICE")
    assert r.json() == []  # excludes self
    r = await a.get("/users/search?q=ob")
    assert [u["username"] for u in r.json()] == ["bob"]
    assert set(r.json()[0]) == {"id", "username", "friendship_status"}  # no email leak
    assert (await a.get("/users/search?q=b")).status_code == 422  # too short
    assert (await a.get("/users/search?q=bo&limit=51")).status_code == 422
    assert (await a.get("/users/search?q=%25%25")).json() == []  # wildcard is escaped
    # email: exact match only
    assert [u["username"] for u in (await a.get("/users/search?q=bob@example.com")).json()] == ["bob"]
    assert (await a.get("/users/search?q=bob@exam")).json() == []


async def test_unread_counts_and_read(users):
    a, b = users["alice"], users["bob"]
    cid = await dm(a, b)
    ids = [
        (await a.post(f"/conversations/{cid}/messages", json={"content": f"m{i}"})).json()["id"]
        for i in range(3)
    ]

    async def unread(client):
        return (await client.get("/conversations")).json()[0]["unread_count"]

    assert await unread(b) == 3
    assert await unread(a) == 0  # own messages auto-read
    assert (await b.post(f"/conversations/{cid}/read", json={"message_id": ids[1]})).json() == {
        "last_read_message_id": ids[1]
    }
    assert await unread(b) == 1
    # only moves forward
    r = await b.post(f"/conversations/{cid}/read", json={"message_id": ids[0]})
    assert r.json()["last_read_message_id"] == ids[1]
    assert await unread(b) == 1
    await b.post(f"/conversations/{cid}/read", json={"message_id": ids[2]})
    assert await unread(b) == 0
    # replying marks sender's side read, and raises alice's count
    await b.post(f"/conversations/{cid}/messages", json={"content": "re"})
    assert await unread(b) == 0 and await unread(a) == 1


async def test_read_message_must_belong_to_conversation(users):
    a, b, c = users["alice"], users["bob"], users["carol"]
    c1, c2 = await dm(a, b), await dm(a, c)
    other = (await a.post(f"/conversations/{c2}/messages", json={"content": "x"})).json()["id"]
    assert (await b.post(f"/conversations/{c1}/read", json={"message_id": other})).status_code == 404
    assert (await b.post(f"/conversations/{c1}/read", json={"message_id": 99999})).status_code == 404
