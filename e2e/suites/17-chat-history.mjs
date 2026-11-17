import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const visible = async (loc, timeout = 15000) => { try { await loc.first().waitFor({ state: "visible", timeout }); return true; } catch { return false; } };
const until = async (fn, timeout = 10000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return true; await sleep(150); } return false; };

// Text of each message in the list, top to bottom, plus whether the rows really are stacked in that order on screen.
const messages = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll("ul[aria-label=Messages] > li")].filter((li) => li.querySelector("p"));
  const tops = rows.map((li) => li.getBoundingClientRect().top);
  return { texts: rows.map((li) => li.querySelector("p").textContent), stacked: tops.every((top, i) => i === 0 || top > tops[i - 1]) };
});
const texts = async (page) => (await messages(page)).texts;
const chatTab = (page) => page.getByRole("tab", { name: /^Chat/ });
const badge = (page) => chatTab(page).evaluate((tab) => tab.querySelector(".bg-danger")?.textContent ?? "");
const say = async (page, text) => {
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
};

const browser = await launch();
const owner = await newPage(browser, { width: 1280, height: 800 });
await owner.context.addCookies([await mintSession("discord-chat-owner", "Chat Owner")]);
const op = owner.page;

console.log("Owner chats before anyone else arrives");
await op.goto(BASE);
await op.click("text=Create room");
await op.waitForURL(/\/room\//);
const roomId = op.url().split("/room/")[1];
await op.getByRole("button", { name: "Join room" }).click();
check(await visible(op.getByText("No messages yet. Say hi 👋")), "an empty room shows the empty chat");
check(await op.getByRole("button", { name: "Send", exact: true }).isDisabled(), "Send is disabled with nothing typed");
check((await op.getByLabel("Message", { exact: true }).getAttribute("maxlength")) === "500", "the message box allows 500 characters");
for (const line of ["first line", "second line", "third line"]) await say(op, line);
check(await until(async () => (await texts(op)).length === 3), "the owner sees their own lines");
check(JSON.stringify(await texts(op)) === JSON.stringify(["first line", "second line", "third line"]), "in the order they were sent");
check((await op.getByLabel("Message", { exact: true }).inputValue()) === "", "the box is cleared after sending");
const voiceDown = await op.getByText("Voice disconnected.").isVisible().catch(() => false);
console.log(`  (voice ${voiceDown ? "is not connected (no LiveKit): chat works without it" : "is connected"})`);

console.log("A friend who joins later sees the history in order, with no unread badge");
const friend = await newPage(browser, { width: 1280, height: 800 });
await friend.context.addCookies([await mintSession("discord-chat-friend", "Chat Friend")]);
const fp = friend.page;
await fp.goto(`${BASE}/room/${roomId}`);
await fp.getByRole("button", { name: "Join room" }).click();
check(await until(async () => (await texts(fp)).length === 3), "the late joiner gets the three earlier lines");
const seen = await messages(fp);
check(JSON.stringify(seen.texts) === JSON.stringify(["first line", "second line", "third line"]) && seen.stacked, "in order, stacked top to bottom");
check(await visible(fp.locator("ul[aria-label=Messages] li").getByText("Chat Owner").first()), "with the sender's name");
await fp.getByRole("tab", { name: /^People/ }).click();
await sleep(500);
check((await badge(fp)) === "", "history does not show as unread");

console.log("New lines while away count as unread");
await say(op, "while you were away");
check(await until(async () => (await badge(fp)) === "1"), "a new line shows a badge of 1 on the Chat tab");
await chatTab(fp).click();
check(await until(async () => (await badge(fp)) === ""), "opening Chat clears the badge");
check((await texts(fp)).at(-1) === "while you were away", "and shows the new line last");

console.log("Reloading keeps the conversation, without duplicates or badges");
await fp.reload();
await fp.getByRole("button", { name: "Join room" }).click();
const expected = ["first line", "second line", "third line", "while you were away"];
check(await until(async () => (await texts(fp)).length >= 4), "the friend's chat is back after a reload");
await sleep(500);
check(JSON.stringify(await texts(fp)) === JSON.stringify(expected), "same lines, same order, no duplicates");
await fp.getByRole("tab", { name: /^People/ }).click();
await sleep(500);
check((await badge(fp)) === "", "no unread badge after a reload");
await chatTab(fp).click();
await op.reload();
await op.getByRole("button", { name: "Join room" }).click();
check(await until(async () => (await texts(op)).length >= 4), "the owner's chat is back after a reload too");
check(JSON.stringify(await texts(op)) === JSON.stringify(expected), "with the same lines");

console.log("Replies go both ways and the list keeps the newest line in view");
for (let i = 1; i <= 8; i++) await say(fp, `reply ${i}`);
check(await until(async () => (await texts(op)).at(-1) === "reply 8"), "the owner gets the friend's replies");
const view = await op.evaluate(() => {
  const list = document.querySelector("ul[aria-label=Messages]").getBoundingClientRect();
  const rows = [...document.querySelectorAll("ul[aria-label=Messages] > li")];
  const last = rows.at(-1).getBoundingClientRect();
  const scroller = document.querySelector("ul[aria-label=Messages]");
  return { overflow: scroller.scrollHeight > scroller.clientHeight, lastInView: last.bottom <= list.bottom + 1 && last.top >= list.top - 1 };
});
check(view.overflow && view.lastInView, `the list scrolls and the newest line is in view (${JSON.stringify(view)})`);
await op.screenshot({ path: "e2e17-chat.png" });

console.log("The server rate limits a flood");
for (let i = 1; i <= 9; i++) await say(fp, `flood ${i}`);
check(await visible(fp.getByRole("status").getByText(/too fast/)), "sending too fast shows a notice");
await sleep(500);
check((await texts(op)).filter((text) => text.startsWith("flood")).length < 9, "and not every line got through");

await browser.close();
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
