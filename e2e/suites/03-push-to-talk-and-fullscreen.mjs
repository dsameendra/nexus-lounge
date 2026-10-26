import { launch, newPage, sleep, speechWav } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const visible = async (loc, timeout = 15000) => { try { await loc.first().waitFor({ state: "visible", timeout }); return true; } catch { return false; } };
const gone = async (loc, timeout = 15000) => { try { await loc.first().waitFor({ state: "detached", timeout }); return true; } catch { return false; } };
const until = async (fn, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; };

const browser = await launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${speechWav()}`, "--auto-select-desktop-capture-source=Entire screen"] });
const mk = async (sub, name, init) => { const c = await newPage(browser, { width: 1280, height: 800 }); await c.context.addCookies([await mintSession(sub, name)]); if (init) await c.context.addInitScript(init); return c.page; };
const row = (page, name) => page.locator(`button[aria-label='${name}, open profile']`);

console.log("Setup");
const owner = await mk("discord-e3-owner", "Owner Three");
await owner.goto(BASE); await owner.click("text=Create room"); await owner.waitForURL(/\/room\//);
const roomId = owner.url().split("/room/")[1];
await owner.getByRole("button", { name: "Join room" }).click();
const ptt = await mk("discord-e3-ptt", "Talker Three", () => { try { localStorage.setItem("nexus-push-to-talk", JSON.stringify({ enabled: true, code: "KeyV" })); } catch {} });
await ptt.goto(`${BASE}/room/${roomId}`);
await ptt.getByRole("button", { name: "Join room" }).click();
await owner.getByRole("tab", { name: "People" }).click();
await ptt.getByRole("tab", { name: "People" }).click();
check(await until(async () => (await row(owner, "Talker Three").count()) > 0), "both people are in the room");

console.log("Push to talk");
await ptt.keyboard.down("v");
await sleep(600);
check((await ptt.getByText("Talking…").count()) === 0, "push to talk does nothing while you are deafened (the default at join)");
await ptt.keyboard.up("v");
await ptt.getByRole("button", { name: "Undeafen" }).click();
check(await visible(ptt.getByText("Push to talk · V")), "push to talk is on and shows its key");
check(await visible(row(owner, "Talker Three").locator("[title='Muted']"), 15000), "the mic is OFF at join even though push to talk was saved (others see Muted)");
await ptt.keyboard.down("v");
check(await until(async () => (await row(owner, "Talker Three").locator("[title='Muted']").count()) === 0, 15000), "holding V opens the mic (others see them unmuted)");
check(await visible(ptt.getByText("Talking…")), "the panel says Talking…");
await ptt.keyboard.up("v");
check(await visible(row(owner, "Talker Three").locator("[title='Muted']"), 15000), "releasing V closes the mic again");
const holdButton = ptt.getByRole("button", { name: /Hold to talk/ });
await ptt.keyboard.down("v");
await sleep(600);
const box = await holdButton.boundingBox();
await ptt.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await ptt.mouse.move(box.x + box.width + 120, box.y + box.height / 2);
await sleep(700);
check(await ptt.getByText("Talking…").count() > 0, "moving the mouse over and off the Hold button does not cut off a held key");
await ptt.keyboard.up("v");

console.log("Auto-advance plays exactly the next video");
const add = async (url, mode) => {
  await owner.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
  await owner.fill("input[placeholder='Paste a YouTube, Twitch or Kick link']", url);
  await owner.getByRole("button", { name: mode }).click();
  await sleep(1200);
};
await add("https://www.youtube.com/watch?v=jNQXAC9IVRw", "Play for everyone");
await add("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "Add to library");
await add("https://www.youtube.com/watch?v=M7lc1UVf-VE", "Add to library");
const onAir = async () => (await owner.locator("section[aria-label='Streams'] li", { hasText: "On air" }).first().innerText().catch(() => "")).split("\n")[0];
check(await until(async () => (await onAir()).includes("Me at the zoo")), "the first video is on air");
check(await until(async () => (await onAir()).includes("Rick Astley"), 70000), "when it ends, the next video starts");
await sleep(9000);
check((await onAir()).includes("Rick Astley"), `it stays on that video and does not skip ahead again (now: ${(await onAir()).slice(0, 30)})`);

console.log("Popovers work in fullscreen");
await owner.getByRole("button", { name: "Fullscreen", exact: true }).click();
await sleep(1200);
const isFull = await owner.evaluate(() => Boolean(document.fullscreenElement));
if (!isFull) console.log("  (headless Chrome did not enter fullscreen; skipping)");
else {
  const cc = owner.getByRole("button", { name: "Subtitles", exact: true });
  await visible(cc, 30000);
  await cc.click();
  const popover = owner.getByRole("menu", { name: "Subtitles" });
  check(await visible(popover), "the subtitles menu opens in fullscreen");
  const hit = await owner.evaluate(() => {
    const menu = document.querySelector("[role=menu]");
    if (!menu) return false;
    const r = menu.getBoundingClientRect();
    return menu.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 20)) && document.fullscreenElement?.contains(menu);
  });
  check(Boolean(hit), "and it is actually inside the fullscreen element and clickable");
  await owner.keyboard.press("Escape");
  await owner.evaluate(() => document.exitFullscreen());
  await sleep(800);
}

console.log("Share notice goes away by itself");
const viewer = await mk("discord-e3-viewer", "Viewer Three");
await viewer.goto(`${BASE}/room/${roomId}`);
await viewer.getByRole("button", { name: "Join room" }).click();
await sleep(5000);
await owner.keyboard.press("Escape");
await owner.getByRole("button", { name: "Share your screen" }).click();
check(await visible(viewer.getByText("started sharing their screen")), "viewers get the notice");
check(await gone(viewer.getByText("started sharing their screen"), 16000), "and it dismisses itself after a few seconds");
const late = await mk("discord-e3-late", "Late Joiner");
await late.goto(`${BASE}/room/${roomId}`);
await late.getByRole("button", { name: "Join room" }).click();
await sleep(6000);
check((await late.getByText("started sharing their screen").count()) === 0, "someone who joins during a share is not told it 'just started'");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
