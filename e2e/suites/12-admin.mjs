import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
import { totpCode } from "../../packages/shared/src/admin-token.ts";
const BASE = process.env.BASE ?? "http://localhost:3001";
const TOTP = process.env.ADMIN_TOTP_SECRET_TEST;
const ADMIN_ID = process.env.ADMIN_TEST_ID ?? "123456789012345678";
if (!TOTP) { console.log("  - skipped: start the stack with the admin variables and set ADMIN_TOTP_SECRET_TEST (see e2e/README.md)"); process.exit(0); }
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const step = (offset = 0) => Math.floor(Date.now() / 30000) + offset;
const browser = await launch();
const open = async (sub, name) => { const c = await newPage(browser, { width: 1100, height: 800 }); if (sub) await c.context.addCookies([await mintSession(sub, name)]); return c; };

console.log("Nobody else can even tell it exists");
for (const [label, sub] of [["anonymous", null], ["a guest", "guest-abc"], ["another Discord user", "999999999999999999"]]) {
  const c = await open(sub, "Nobody");
  const statuses = [];
  for (const path of ["/admin", "/admin/login", "/api/admin/overview"]) statuses.push((await c.page.goto(`${BASE}${path}`))?.status());
  check(statuses.every((s) => s === 404), `${label}: /admin, /admin/login and the API are all 404 (${statuses.join(",")})`);
  await c.context.close();
}

console.log("Admin login");
const a = await open(ADMIN_ID, "Admin");
const p = a.page;
const response = await p.goto(`${BASE}/admin`);
check(new URL(p.url()).pathname === "/admin/login", "a signed-in admin without the code is sent to the code page");
check(/no-store/.test(response?.headers()["cache-control"] ?? "") && /noindex/.test(response?.headers()["x-robots-tag"] ?? ""), "admin pages are never cached or indexed");
await p.getByLabel("Authenticator code").fill("000000"); await p.getByRole("button", { name: "Continue" }).click();
check(await p.getByRole("alert").filter({ hasText: "didn't work" }).waitFor({ timeout: 5000 }).then(() => true, () => false), "a wrong code is rejected");
const code = totpCode(TOTP, step());
await p.getByLabel("Authenticator code").fill(code); await p.getByRole("button", { name: "Continue" }).click();
check(await p.getByText("Active rooms").waitFor({ timeout: 8000 }).then(() => true, () => false), "the right code opens the overview");
const cookie = (await a.context.cookies()).find((c) => c.name === "admin-session" || c.name === "__Host-admin");
check(Boolean(cookie?.httpOnly) && cookie?.sameSite === "Strict", "the admin cookie is HttpOnly and SameSite=Strict");
check(Boolean(cookie) && cookie.expires - Date.now() / 1000 <= 30 * 60 + 5 && cookie.expires - Date.now() / 1000 > 25 * 60, "it lasts 30 minutes");
const cross = await a.context.request.get(`${BASE}/api/admin/overview`, { headers: { "sec-fetch-site": "cross-site" } });
check(cross.status() === 404, "a cross-site request to the API is refused");
const same = await a.context.request.get(`${BASE}/api/admin/overview`);
check(same.status() === 200 && /no-store/.test(same.headers()["cache-control"] ?? ""), "the same-origin API works and is no-store");

console.log("Live data");
const host = await open("222222222222222222", "Room Host");
await host.page.goto(BASE); await host.page.fill("input[placeholder='Room name (optional)']", "Admin Test Room"); await host.page.click("text=Create room"); await host.page.waitForURL(/\/room\//);
await host.page.getByRole("button", { name: "Join room" }).click();
check(await p.getByText("Admin Test Room").first().waitFor({ timeout: 15000 }).then(() => true, () => false), "a new room shows up with its host");
await p.getByText("Room Host").first().waitFor({ timeout: 15000 }).catch(() => {});
const text = await p.locator("main").innerText();
check(text.includes("Room Host") && !/token|hash|salt/i.test(text), "people appear by name and nothing sensitive is on the page");
await host.context.close();

console.log("Locking and replay");
await p.getByRole("button", { name: "Lock" }).click();
await p.waitForURL((url) => url.pathname === "/", { timeout: 8000 });
await p.goto(`${BASE}/admin`);
check(new URL(p.url()).pathname === "/admin/login", "Lock ends the admin session");
await p.getByLabel("Authenticator code").fill(code); await p.getByRole("button", { name: "Continue" }).click();
check(await p.getByRole("alert").waitFor({ timeout: 5000 }).then(() => true, () => false), "the same code can't be used twice");
for (let i = 0; i < 5; i++) { await p.getByLabel("Authenticator code").fill("111111"); await p.getByRole("button", { name: "Continue" }).click(); await sleep(300); }
await p.getByLabel("Authenticator code").fill(totpCode(TOTP, step(1))); await p.getByRole("button", { name: "Continue" }).click();
check(await p.getByText("Too many wrong codes").waitFor({ timeout: 5000 }).then(() => true, () => false), "repeated wrong codes lock the login for a few minutes");
await a.context.close();

console.log("Privacy policy");
const anon = await open(null);
await anon.page.goto(`${BASE}/privacy`);
check(await anon.page.getByText(/operator can see, live, which rooms exist/).isVisible(), "the policy tells people the operator can see live presence");
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
