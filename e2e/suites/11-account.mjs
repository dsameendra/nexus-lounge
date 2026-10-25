import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const until = async (fn, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; };

const browser = await launch();

console.log("Legal pages are public");
const anon = await newPage(browser, { width: 1280, height: 800 });
for (const [path, heading] of [["/terms", "Terms of Service"], ["/privacy", "Privacy Policy"]]) {
  const response = await anon.page.goto(`${BASE}${path}`);
  check(response?.status() === 200 && new URL(anon.page.url()).pathname === path, `${path} opens without signing in`);
  check(await anon.page.getByRole("heading", { name: heading, level: 1 }).isVisible(), `${path} has its heading`);
}
await anon.page.goto(`${BASE}/login`);
check(await anon.page.getByRole("link", { name: "Terms of Service" }).isVisible() && await anon.page.getByRole("link", { name: "Privacy Policy" }).isVisible(), "the sign-in page links to both");
await anon.context.close();

console.log("Profile");
const user = await newPage(browser, { width: 1280, height: 800 });
await user.context.addCookies([await mintSession("discord-acct-1", "Acct One")]);
const p = user.page;
await p.goto(`${BASE}/account`);
const nameInput = p.getByLabel("Display name");
check((await nameInput.inputValue()) === "Acct One", "the account page shows the current name");
const save = p.getByRole("button", { name: "Save changes" });
check(await save.isDisabled(), "Save is disabled until something changes");
await nameInput.fill("A");
check(await save.isDisabled() && await p.getByText("Names are 2 to 24 characters.").isVisible(), "a too-short name is rejected");
await nameInput.fill("New Name");
await p.getByRole("button", { name: "Avatar star" }).click();
const patched = p.waitForResponse((r) => r.url().includes("/api/account") && r.request().method() === "PATCH", { timeout: 8000 }).catch(() => null);
await save.click();
const reply = await patched;
console.log("  PATCH status", reply?.status());
check(await p.getByRole("status").filter({ hasText: "Saved" }).waitFor({ timeout: 8000 }).then(() => true, () => false), "saving confirms");
await p.reload();
check((await p.getByLabel("Display name").inputValue()) === "New Name", "the name survives a reload");
check(await p.locator("img[src='/avatars/star.svg']").first().isVisible(), "the chosen avatar is shown");
await p.goto(BASE);
check(await p.getByText("New Name").first().isVisible(), "the home page uses the new name");

console.log("Name and avatar reach the room");
await p.getByRole("button", { name: "Create room" }).click(); await p.waitForURL(/\/room\//);
await p.getByRole("button", { name: "Join room" }).click();
check(await until(async () => (await p.getByText("New Name").count()) > 0), "the room shows the new name");
check(await until(async () => (await p.locator("img[src='/avatars/star.svg']").count()) > 0), "the room shows the new avatar");

console.log("Deleting needs you to be out of a room");
const acct = await user.context.newPage();
await acct.goto(`${BASE}/account`);
await acct.getByRole("button", { name: "Delete my account…" }).click();
const del = acct.getByRole("button", { name: "Permanently delete" });
check(await del.isDisabled(), "delete stays disabled until you type DELETE");
await acct.getByLabel(/Type/).fill("DELETE");
await del.click();
check(await acct.getByRole("alert").filter({ hasText: "still in a room" }).waitFor({ timeout: 8000 }).then(() => true, () => false), "deleting while in a room is refused with an explanation");

await p.goto(BASE);
await sleep(1500);
await del.click();
check(await acct.waitForURL(/\/login\?deleted=1/, { timeout: 15000 }).then(() => true, () => false), "after leaving the room the account is deleted and you land on sign-in");
check(await acct.getByText("Your account was deleted.").isVisible(), "the sign-in page confirms it");
await acct.goto(BASE);
check(new URL(acct.url()).pathname === "/login", "you are signed out afterwards");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
