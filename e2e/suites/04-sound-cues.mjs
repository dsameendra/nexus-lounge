import { launch, newPage, sleep, speechWav } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const visible = async (loc, timeout = 15000) => { try { await loc.first().waitFor({ state: "visible", timeout }); return true; } catch { return false; } };
const until = async (fn, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(250); } return false; };

const recorder = () => {
  window.__cues = [];
  const create = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () {
    const osc = create.call(this);
    const start = osc.start.bind(osc);
    osc.start = (...args) => { window.__cues.push(Math.round(osc.frequency.value * 100) / 100); return start(...args); };
    return osc;
  };
};
const heard = (page) => page.evaluate(() => [...window.__cues]);
const reset = (page) => page.evaluate(() => { window.__cues.length = 0; });
const sequence = async (page, expected, label, timeout = 6000) => {
  const ok = await until(async () => JSON.stringify((await heard(page)).slice(-expected.length)) === JSON.stringify(expected), timeout);
  check(ok, `${label} → ${expected.join(", ")} Hz${ok ? "" : " (heard " + JSON.stringify(await heard(page)) + ")"}`);
};

const browser = await launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${speechWav()}`] });
const mk = async (sub, name, withRecorder = true) => {
  const c = await newPage(browser, { width: 1280, height: 800 });
  await c.context.addCookies([await mintSession(sub, name)]);
  if (withRecorder) await c.context.addInitScript(recorder);
  return c;
};

console.log("Setup");
const owner = await mk("discord-e4-owner", "Owner Four");
const op = owner.page;
await op.goto(BASE); await op.click("text=Create room"); await op.waitForURL(/\/room\//);
const roomId = op.url().split("/room/")[1];
await op.getByRole("button", { name: "Join room" }).click();
const early = await mk("discord-e4-early", "Early Bird");
await early.page.goto(`${BASE}/room/${roomId}`);
await early.page.getByRole("button", { name: "Join room" }).click();
await sleep(4000);

console.log("Cues for your own actions");
await op.getByRole("button", { name: "Unmute", exact: true }).click();
await sleep(1500);
await reset(op);
await op.getByRole("button", { name: "Mute", exact: true }).click();
await sequence(op, [523.25, 392], "mute");
await op.getByRole("button", { name: "Unmute", exact: true }).click();
await sequence(op, [392, 523.25], "unmute");
await op.getByRole("button", { name: "Deafen", exact: true }).click();
await sequence(op, [440, 349.23, 261.63], "deafen");
await op.getByRole("button", { name: "Undeafen", exact: true }).click();
await sequence(op, [261.63, 349.23, 440], "undeafen");
check(await visible(op.getByRole("button", { name: "Mute", exact: true })), "undeafen puts your microphone back the way it was");

console.log("Cues for other people");
await sleep(500);
await reset(op);
const joiner = await mk("discord-e4-join", "New Arrival", false);
await joiner.page.goto(`${BASE}/room/${roomId}`);
await joiner.page.getByRole("button", { name: "Join room" }).click();
await sequence(op, [523.25, 659.25], "someone joins", 12000);
await sleep(800);
await reset(op);
await joiner.page.getByRole("button", { name: "Leave" }).click();
await sequence(op, [659.25, 523.25], "someone leaves", 15000);

console.log("Cues when the owner restricts you");
await early.page.getByRole("tab", { name: "People" }).click();
await op.getByRole("tab", { name: "People" }).click();
await reset(early.page);
await op.locator("button[aria-label='Early Bird, open profile']").click({ button: "right" });
await op.getByRole("menu").getByRole("switch", { name: "Mute for everyone" }).click();
await sequence(early.page, [329.63, 329.63], "owner mutes you");
await reset(early.page);
await op.getByRole("menu").getByRole("switch", { name: "Mute for everyone" }).click();
await sequence(early.page, [392, 587.33], "owner lifts it");
await op.keyboard.press("Escape");

console.log("Quiet at join, and a setting to turn them off");
const fresh = await mk("discord-e4-fresh", "Fresh Face");
await fresh.page.goto(`${BASE}/room/${roomId}`);
await fresh.page.getByRole("button", { name: "Join room" }).click();
await sleep(3500);
check((await heard(fresh.page)).length === 0, "no cues for the people who were already there when you join");
await op.getByRole("button", { name: "Voice settings" }).click();
const sw = op.getByRole("switch", { name: "Sound cues" });
check(await visible(sw), "Voice settings has a Sound cues switch");
await sw.click();
await op.keyboard.press("Escape");
await reset(op);
await op.getByRole("button", { name: "Mute", exact: true }).click();
await sleep(900);
check((await heard(op)).length === 0, "with Sound cues off, muting is silent");
await op.getByRole("button", { name: "Voice settings" }).click();
await op.getByRole("switch", { name: "Sound cues" }).click();
await op.keyboard.press("Escape");

console.log("Settings icon");
await op.screenshot({ path: "e2e4-header.png", clip: { x: 900, y: 0, width: 380, height: 60 } });
check(await op.getByRole("button", { name: "Room settings" }).count() === 1, "owner has the Room settings button");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
