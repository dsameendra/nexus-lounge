import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const visible = async (loc, timeout = 15000) => { try { await loc.first().waitFor({ state: "visible", timeout }); return true; } catch { return false; } };
const gone = async (loc, timeout = 8000) => { try { await loc.first().waitFor({ state: "detached", timeout }); return true; } catch { return false; } };

const browser = await launch();
const user = async (sub, name, extra = {}, viewport = { width: 1280, height: 800 }) => {
  const c = await newPage(browser, viewport, extra);
  await c.context.addCookies([await mintSession(sub, name)]);
  return c;
};
const create = async (page, name, password) => {
  await page.goto(BASE);
  await page.fill("input[placeholder='Room name (optional)']", name);
  if (password) await page.fill("input[placeholder='Room password (optional)']", password);
  await page.click("text=Create room");
  await page.waitForURL(/\/room\//);
  const id = page.url().split("/room/")[1];
  await page.getByRole("button", { name: "Join room" }).click();
  await page.getByRole("button", { name: "Room settings" }).waitFor({ timeout: 20000 });
  return id;
};
const enter = async (page, id, password) => {
  await page.goto(`${BASE}/room/${id}`);
  if (password) {
    await page.getByPlaceholder("Room password").fill(password);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByRole("button", { name: "Join room" }).click({ timeout: 20000 });
  await page.getByRole("button", { name: "Copy invite" }).waitFor({ timeout: 20000 });
};
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("nexus-recent-rooms") ?? "null"));

console.log("Host schedules a room (host in India, member in New York)");
const host = await user("discord-e18-host", "Host Eighteen", { timezoneId: "Asia/Kolkata" });
const hp = host.page;
const roomId = await create(hp, "Finals watch");
const target = Math.ceil((Date.now() + 2 * 3600_000) / 60_000) * 60_000;
const localValue = await hp.evaluate((epoch) => {
  const d = new Date(epoch);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}, target);
await hp.getByRole("button", { name: "Room settings" }).click();
await hp.getByLabel("Start time").fill(localValue);
await hp.getByRole("button", { name: "Set", exact: true }).click();
check(await visible(hp.getByText(/Starts .*your time/)), "the settings sheet confirms the start time");
await hp.keyboard.press("Escape");
const hostTime = hp.locator("header time[data-starts-at]");
check(await visible(hostTime), "the host's header shows the start time");
check((await hostTime.getAttribute("data-starts-at")) === String(target), "the local time typed in Kolkata is stored as the right UTC instant");

const member = await user("discord-e18-member", "Member Eighteen", { timezoneId: "America/New_York", permissions: ["clipboard-read", "clipboard-write"] });
const mp = member.page;
await enter(mp, roomId);
const memberTime = mp.locator("header time[data-starts-at]");
check(await visible(memberTime), "another member sees the start time in the header");
check((await memberTime.getAttribute("data-starts-at")) === String(target), "for the same instant");
const relative = (await memberTime.textContent()) ?? "";
check(/^Starts in (1|2) hours?$/.test(relative.trim()), `it reads as a relative time ("${relative.trim()}")`);
const exactTitle = (await memberTime.getAttribute("title")) ?? "";
const expectedNy = await mp.evaluate((epoch) => new Date(epoch).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" }), target);
check(exactTitle.includes(expectedNy), `the exact time is in the member's own zone (${exactTitle})`);
await memberTime.click();
check(((await memberTime.textContent()) ?? "").startsWith("Starts ") && !(await memberTime.textContent()).includes(" in "), "tapping it shows the exact date and time");

await mp.getByRole("button", { name: "Copy invite" }).click();
await sleep(300);
const invite = await mp.evaluate(() => navigator.clipboard.readText());
const seconds = Math.floor(target / 1000);
check(invite.split("\n")[0] === `${BASE}/room/${roomId}`, "the copied invite starts with the room link");
check(invite.includes(`<t:${seconds}:F>`) && invite.includes(`<t:${seconds}:R>`), "and carries Discord timestamps for the start time");

console.log("Header geometry on phones");
for (const [label, viewport] of [["phone-portrait", { width: 390, height: 844 }], ["phone-landscape", { width: 844, height: 390 }]]) {
  const phone = await user(`discord-e18-${label}`, `Phone ${label}`, { isMobile: true, hasTouch: true }, viewport);
  await enter(phone.page, roomId);
  await phone.page.locator("header time[data-starts-at]").waitFor({ timeout: 15000 });
  const geometry = await phone.page.evaluate(() => {
    const header = document.querySelector("header");
    const time = header.querySelector("time[data-starts-at]");
    const rect = (el) => el.getBoundingClientRect().toJSON();
    const items = [...header.querySelectorAll("button, time, span.truncate")].filter((el) => el.getBoundingClientRect().width > 0).map(rect);
    const t = rect(time);
    const buttons = [...header.querySelectorAll("button")].filter((el) => !el.contains(time) && el.getBoundingClientRect().width > 0).map(rect);
    const hit = document.elementFromPoint(t.left + Math.min(t.width / 2, 20), t.top + t.height / 2);
    return {
      width: window.innerWidth,
      header: rect(header),
      inside: items.every((r) => r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= rect(header).bottom + 0.5),
      overlaps: buttons.some((b) => b.left < t.right && b.right > t.left && b.top < t.bottom && b.bottom > t.top),
      hitsTime: Boolean(hit && (time === hit || time.contains(hit) || hit.contains(time))),
      scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      timeHeight: t.height,
    };
  });
  check(geometry.inside, `${label}: every header item lies inside the viewport and the header`);
  check(!geometry.overlaps, `${label}: the start time does not run under the header buttons`);
  check(geometry.hitsTime, `${label}: the start time is on top where it is drawn (elementFromPoint)`);
  check(!geometry.scroll, `${label}: no horizontal scroll`);
  check(geometry.header.height <= (label === "phone-landscape" ? 46 : 58), `${label}: the header keeps its height (${Math.round(geometry.header.height)}px)`);
  await phone.page.screenshot({ path: `e2e-18-${label}.png` });
  await phone.context.close();
}

console.log("Recent rooms on the home page");
const pwRoom = await create(hp, "Secret screening", "pw-18");
await hp.getByRole("button", { name: "Room settings" }).click();
await hp.getByLabel("Start time").fill(localValue);
await hp.getByRole("button", { name: "Set", exact: true }).click();
await hp.keyboard.press("Escape");
await enter(mp, pwRoom, "pw-18");
await mp.goto(BASE);
const list = mp.getByRole("region", { name: "Recent rooms" });
check(await visible(list), "the member's home page shows Recent rooms");
const rows = list.locator("li[data-room]");
check((await rows.evaluateAll((els) => els.map((el) => el.dataset.room))).join() === [pwRoom, roomId].join(), "both visited rooms are listed, newest first");
await mp.waitForFunction(() => [...document.querySelectorAll("li[data-room]")].every((li) => li.dataset.status !== "checking"), null, { timeout: 15000 });
const pwRow = list.locator(`li[data-room='${pwRoom}']`);
await mp.screenshot({ path: "e2e-18-home.png" });
check(await visible(pwRow.getByRole("img", { name: "Password protected" })), "a password room shows a lock");
const lookup = await mp.evaluate((id) => fetch(`/api/rooms/${id}`).then((r) => r.json()), pwRoom);
check(lookup.startsAt === null && Object.keys(lookup).sort().join() === "hasPassword,id,name,startsAt", "the lookup does not reveal a password room's start time");
check(await visible(list.locator(`li[data-room='${roomId}'] time[data-starts-at='${target}']`)), "an open scheduled room shows its start time");
check(await visible(list.getByText("Finals watch")), "rows carry the room name");
await list.locator(`a[href='/room/${roomId}']`).click();
await mp.waitForURL(`${BASE}/room/${roomId}`);
check(await visible(mp.getByRole("button", { name: "Join room" })), "a row links back into the room");
check(await visible(mp.getByText(/Starts in .* · /)), "the join screen shows the start time");

console.log("A room that no longer exists");
await mp.goto(BASE);
await mp.evaluate(() => {
  const data = JSON.parse(localStorage.getItem("nexus-recent-rooms"));
  data.rooms.push({ id: "zz18zz18", name: "Long gone", visitedAt: 1, startsAt: null });
  localStorage.setItem("nexus-recent-rooms", JSON.stringify(data));
});
await mp.reload();
const goneRow = list.locator("li[data-room='zz18zz18']");
await goneRow.waitFor({ timeout: 15000 });
await mp.waitForFunction(() => document.querySelector("li[data-room='zz18zz18']")?.dataset.status === "gone", null, { timeout: 15000 });
check((await goneRow.locator("a").count()) === 0, "an ended room is not offered as a link");
check(await visible(goneRow.getByText("Ended")), "it says Ended");
check(!(await stored(mp)).rooms.some((room) => room.id === "zz18zz18"), "and is dropped from storage for next time");

console.log("Removing, and nothing when the list is empty");
await list.getByRole("button", { name: "Remove Finals watch from recent rooms" }).click();
check(await gone(list.locator(`li[data-room='${roomId}']`)), "a removed room disappears");
await mp.reload();
await list.locator("li[data-room]").first().waitFor({ timeout: 15000 });
check((await list.locator(`li[data-room='${roomId}']`).count()) === 0, "and stays removed after a reload");
await list.getByRole("button", { name: "Remove Secret screening from recent rooms" }).click();
check(await gone(list), "an empty list renders nothing");
check((await stored(mp)) === null, "an empty list leaves nothing in storage");

console.log("TV view is never recorded; signing out clears the list");
await enter(mp, roomId);
await mp.goto(`${BASE}/room/${roomId}/tv`);
await mp.getByRole("button", { name: "Start watching" }).click({ timeout: 30000 }).catch(() => {});
await sleep(4000);
check(((await stored(mp))?.rooms ?? []).map((room) => room.id).join() === roomId, "visiting the TV view adds nothing");
await mp.goto(BASE);
check(await visible(list), "the visited room is back on the list");
await mp.getByRole("button", { name: "Sign out" }).click();
await mp.waitForURL(/\/login/);
check((await stored(mp)) === null, "signing out clears the list");
await member.context.addCookies([await mintSession("discord-e18-member", "Member Eighteen")]);
await mp.goto(BASE);
await sleep(1000);
check((await list.count()) === 0, "signing back in starts with no recent rooms");

console.log("Clearing the start time");
await hp.goto(`${BASE}/room/${roomId}`);
await hp.getByRole("button", { name: "Join room" }).click();
await hp.getByRole("button", { name: "Room settings" }).click();
await hp.getByRole("button", { name: "Clear", exact: true }).click();
await hp.keyboard.press("Escape");
check(await gone(hp.locator("header time[data-starts-at]")), "a cleared start time leaves the header");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
