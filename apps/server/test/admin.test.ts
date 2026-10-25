import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import { signAdminRequest } from "@nexus/shared/admin-token";
import { signSessionToken } from "@nexus/shared/session-token";

const AUTH = "test-secret-test-secret-123456";
const ADMIN = "admin-secret-admin-secret-admin-secret-1234";
const ADMIN_ID = "123456789012345678";
const OTHER_ID = "987654321098765432";
const ON = 4312;
const OFF = 4313;
const children: ChildProcess[] = [];

function start(port: number, extra: Record<string, string>) {
  const child = spawn("node", ["src/index.ts"], {
    env: { ...process.env, PORT: String(port), AUTH_SECRET: AUTH, LIVEKIT_URL: "ws://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s", ...extra },
    stdio: "ignore",
  });
  children.push(child);
  return (async () => {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/health`)).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("server did not start");
  })();
}

before(async () => {
  await Promise.all([start(ON, { ADMIN_SECRET: ADMIN, ADMIN_DISCORD_IDS: ` ${ADMIN_ID}, ,not-an-id` }), start(OFF, {})]);
});
after(() => children.forEach((child) => child.kill()));

const get = (port: number, path: string, token?: string) =>
  fetch(`http://localhost:${port}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

const forge = (header: object, claims: object, secret = ADMIN) => {
  const body = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
};
const now = () => Math.floor(Date.now() / 1000);
const claims = (over: object = {}) => ({ iss: "nexus-web", aud: "admin", sub: ADMIN_ID, jti: crypto.randomUUID(), iat: now(), exp: now() + 60, ...over });

// The server with admin disabled has no such route, so its 404 for this path is the reference.
async function stockNotFound() {
  const response = await get(OFF, "/admin/overview");
  return { status: response.status, body: await response.text() };
}

test("admin overview: every failure is the stock 404", async () => {
  const stock = await stockNotFound();
  assert.equal(stock.status, 404);
  const attempts: [string, string | undefined][] = [
    ["no token", undefined],
    ["garbage", "not.a.token"],
    ["signed with AUTH_SECRET", signAdminRequest(ADMIN_ID, AUTH)],
    ["not on the allowlist", signAdminRequest(OTHER_ID, ADMIN)],
    ["session token", signSessionToken({ sub: ADMIN_ID, name: "x", image: null, guest: false }, ADMIN)],
    ["wrong audience", forge({ alg: "HS256", typ: "JWT" }, claims({ aud: "admin-session" }))],
    ["wrong issuer", forge({ alg: "HS256", typ: "JWT" }, claims({ iss: "someone" }))],
    ["expired", forge({ alg: "HS256", typ: "JWT" }, claims({ iat: now() - 200, exp: now() - 100 }))],
    ["lifetime too long", forge({ alg: "HS256", typ: "JWT" }, claims({ exp: now() + 3600 }))],
    ["extra claims", forge({ alg: "HS256", typ: "JWT" }, claims({ admin: true }))],
    ["guest-style subject", forge({ alg: "HS256", typ: "JWT" }, claims({ sub: "guest-1234" }))],
    ["alg none", `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims())).toString("base64url")}.`],
    ["wrong alg header", forge({ alg: "HS512", typ: "JWT" }, claims())],
  ];
  for (const [label, token] of attempts) {
    const response = await get(ON, "/admin/overview", token);
    assert.equal(response.status, stock.status, label);
    assert.equal(await response.text(), stock.body, `${label}: body must match the stock 404`);
  }
  const post = await fetch(`http://localhost:${ON}/admin/overview`, { method: "POST", headers: { authorization: `Bearer ${signAdminRequest(ADMIN_ID, ADMIN)}` } });
  assert.equal(post.status, 404);
});

test("admin overview: valid token works once, leaks nothing sensitive", async () => {
  const host = `Host‮${"x".repeat(60)}`;
  const created = await fetch(`http://localhost:${ON}/rooms`, {
    method: "POST",
    headers: { authorization: `Bearer ${signSessionToken({ sub: "555555555555555555", name: host, image: null, guest: false }, AUTH)}`, "content-type": "application/json" },
    body: JSON.stringify({ password: "hunter2-secret", name: "Movie night" }),
  });
  assert.equal(created.status, 201);

  const token = signAdminRequest(ADMIN_ID, ADMIN);
  const response = await get(ON, "/admin/overview", token);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  const text = await response.text();
  for (const forbidden of ["hash", "salt", "ticket", "token", "secret", "hunter2", "pending", "restriction", "image"]) {
    assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), `response must not contain "${forbidden}"`);
  }
  assert.ok(!/[‮​]/.test(text), "invisible and bidi characters are stripped");
  const data = JSON.parse(text) as { totals: object; truncated: boolean; rooms: { name: string; hasPassword: boolean; members: object[] }[] };
  assert.deepEqual(Object.keys(data).sort(), ["generatedAt", "rooms", "totals", "truncated"]);
  const room = data.rooms.find((entry) => entry.name === "Movie night");
  assert.ok(room);
  assert.equal(room.hasPassword, true);
  assert.deepEqual(Object.keys(room).sort(), ["createdAt", "hasPassword", "host", "id", "memberCount", "members", "name", "playing", "tvCount"]);

  const replay = await get(ON, "/admin/overview", token);
  assert.equal(replay.status, 404, "a token can be used only once");
});

test("admin overview: not registered when admin is not configured", async () => {
  const unknown = await (await get(OFF, "/admin/other")).text();
  const response = await get(OFF, "/admin/overview", signAdminRequest(ADMIN_ID, ADMIN));
  assert.equal(response.status, 404);
  assert.equal(await response.text(), unknown.replace("other", "overview"));
});
