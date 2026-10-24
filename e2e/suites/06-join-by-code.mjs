import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const visible = async (loc, timeout = 15000) => { try { await loc.first().waitFor({ state: "visible", timeout }); return true; } catch { return false; } };

const browser = await launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const user = async (sub, name) => { const c = await newPage(browser, { width: 1280, height: 800 }); if (sub) await c.context.addCookies([await mintSession(sub, name)]); return c.page; };
const create = async (page, name, password) => {
  await page.goto(BASE);
  if (name) await page.fill("input[placeholder='Room name (optional)']", name);
  if (password) await page.fill("input[placeholder='Room password (optional)']", password);
  await page.click("text=Create room");
  await page.waitForURL(/\/room\//);
  const code = page.url().split("/room/")[1];
  await page.getByRole("button", { name: "Join room" }).click();
  return code;
};

console.log("Setup: a password room and an open room");
const owner = await user("discord-e6-owner", "Owner Six");
const lockedCode = await create(owner, "Locked room", "s3cret");
const owner2 = await user("discord-e6-owner2", "Owner Six B");
const openCode = await create(owner2, "Open room", "");

console.log("Signed-in user joins by code");
const b = await user("discord-e6-b", "Joiner B");
await b.goto(BASE);
check(await visible(b.getByRole("form", { name: "Join a room with a code" })), "the home page has a Join with code form");
await b.getByLabel("Room code").fill(`  ${lockedCode.toUpperCase().slice(0, 4)} ${lockedCode.toUpperCase().slice(4)}  `);
await b.getByRole("button", { name: "Join with code" }).click();
check(await visible(b.getByText("is password protected")), "a password field appears for a protected room, showing its name");
check(await visible(b.getByText("Locked room")), "and names the room");
await b.getByLabel("Room password").fill("wrong-one");
await b.getByRole("button", { name: "Join room" }).click();
check(await visible(b.getByText("Wrong password.")), "a wrong password is refused with a clear message");
await b.getByPlaceholder("Room password").fill("s3cret");
await b.getByRole("button", { name: "Continue" }).click();
check(await visible(b.getByRole("button", { name: "Join room" })), "the right password gets you in");
await b.getByRole("button", { name: "Join room" }).click();
await owner.getByRole("tab", { name: "People" }).click();
check(await visible(owner.locator("button[aria-label='Joiner B, open profile']"), 20000), "they appear in the room");

console.log("Guest pastes a whole invite link");
const guest = await user(null, "");
await guest.goto(`${BASE}/login`);
await guest.fill("input[name=name]", "Guest Six");
await guest.click("text=Continue as guest");
await guest.waitForURL(`${BASE}/`);
check((await guest.getByRole("button", { name: "Create room" }).count()) === 0, "guests don't get a Create room button");
await guest.getByLabel("Room code").fill(`${BASE}/room/${lockedCode}?utm=x`);
await guest.getByRole("button", { name: "Join with code" }).click();
await guest.getByLabel("Room password").fill("s3cret");
await guest.getByRole("button", { name: "Join room" }).click();
check(await visible(guest.getByText("Waiting to be let in")), "a guest with the right password still waits for the owner");
await owner.getByRole("button", { name: "Let in" }).click({ timeout: 20000 });
check(await visible(guest.getByRole("button", { name: "Join room" }), 25000), "and gets in once the owner lets them");

console.log("Open room and bad codes");
const c = await user("discord-e6-c", "Joiner C");
await c.goto(BASE);
await c.getByLabel("Room code").fill(openCode);
await c.getByRole("button", { name: "Join with code" }).click();
check(await visible(c.getByRole("button", { name: "Join room" })), "an open room needs no password");
await c.goto(BASE);
await c.getByLabel("Room code").fill("nope");
await c.getByRole("button", { name: "Join with code" }).click();
check(await visible(c.getByText("That doesn't look like a room code")), "a malformed code is explained");
await c.getByLabel("Room code").fill("zzzzzzzz");
await c.getByRole("button", { name: "Join with code" }).click();
check(await visible(c.getByText("There's no room with that code")), "an unknown code says there's no such room");

console.log("The invite link still works");
const d = await user("discord-e6-d", "Joiner D");
await d.goto(`${BASE}/room/${openCode}`);
check(await visible(d.getByRole("button", { name: "Join room" })), "opening the link goes straight to the room");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
