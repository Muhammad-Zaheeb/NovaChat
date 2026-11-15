REG = {"username": "alice", "email": "alice@example.com", "password": "password123"}


async def test_register_login_me_logout(client):
    r = await client.post("/auth/register", json=REG)
    assert r.status_code == 201 and r.json()["username"] == "alice"
    assert (await client.get("/auth/me")).status_code == 401
    assert (await client.post("/auth/login", json={"email": REG["email"], "password": REG["password"]})).status_code == 200
    me = await client.get("/auth/me")
    assert me.status_code == 200 and me.json()["email"] == REG["email"]
    assert (await client.post("/auth/logout")).status_code == 200
    assert (await client.get("/auth/me")).status_code == 401


async def test_duplicate_email_and_username(client):
    await client.post("/auth/register", json=REG)
    r = await client.post("/auth/register", json={**REG, "username": "other"})
    assert r.status_code == 409
    r = await client.post("/auth/register", json={**REG, "email": "other@example.com"})
    assert r.status_code == 409


async def test_bad_login(client):
    await client.post("/auth/register", json=REG)
    r = await client.post("/auth/login", json={"email": REG["email"], "password": "wrongpassword"})
    assert r.status_code == 401
    r = await client.post("/auth/login", json={"email": "nobody@example.com", "password": "password123"})
    assert r.status_code == 401
