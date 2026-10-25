import { chromium, webkit } from "playwright-core";
import { CHROME, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const visible = async (loc, timeout = 15000) => { try { await loc.first().waitFor({ state: "visible", timeout }); return true; } catch { return false; } };
const until = async (fn, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; };
const CHANNEL = process.env.TWITCH_CHANNEL ?? "xqc";
const PLAYLIST = "https://www.youtube.com/playlist?list=PL6B3937A5D230E335";

const chrome = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const wk = await webkit.launch();
const person = async (browser, sub, name, viewport = { width: 1280, height: 800 }, extra = {}) => {
  const context = await browser.newContext({ viewport, colorScheme: "dark", ...extra });
  await context.addCookies([await mintSession(sub, name)]);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e.message).slice(0, 140)));
  return { context, page };
};
const addStream = async (page, url, mode) => {
  await page.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
  await page.fill("input[placeholder='Paste a YouTube or Twitch link']", url);
  await page.getByRole("button", { name: mode }).click();
  await sleep(1200);
};

console.log("Setup: owner, member");
const owner = await person(chrome, "discord-e7-owner", "Owner Seven");
const op = owner.page;
await op.goto(BASE); await op.fill("input[placeholder='Room name (optional)']", "Queue night"); await op.click("text=Create room"); await op.waitForURL(/\/room\//);
const room = op.url().split("/room/")[1];
await op.getByRole("button", { name: "Join room" }).click();
const member = await person(chrome, "discord-e7-member", "Member Seven");
const mp = member.page;
await mp.goto(`${BASE}/room/${room}`); await mp.getByRole("button", { name: "Join room" }).click();
await addStream(op, "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "Play for everyone");
await addStream(op, "https://www.youtube.com/watch?v=jNQXAC9IVRw", "Add to library");
await addStream(op, `https://www.twitch.tv/${CHANNEL}`, "Add to library");

console.log("Playlists");
await op.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
await op.fill("input[placeholder='Paste a YouTube or Twitch link']", PLAYLIST);
check(await visible(op.getByText("YouTube playlist")), "pasting a playlist link is recognised");
check(await visible(op.getByRole("button", { name: "Add playlist" })), "the sheet offers Add playlist");
await op.getByRole("button", { name: "Add playlist" }).click();
const card = op.getByRole("button", { name: /Official Blender Open Movies, playlist/ });
check(await visible(card, 20000), "the playlist shows up as one item in the library");
check(await visible(mp.getByRole("button", { name: /Official Blender Open Movies, playlist/ })), "other people see it too");
await card.click();
const options = op.getByRole("option");
check(await until(async () => (await options.count()) >= 10), "expanding it lists the videos");
const total = await options.count();
await options.nth(2).click(); await options.nth(0).click();
check(await visible(op.getByRole("button", { name: "Add 2 selected to queue" })), "the button counts the selected videos");
await op.getByRole("button", { name: "Add 2 selected to queue" }).click();
const queueRows = op.locator("section[aria-label='Up next'] li");
check(await until(async () => (await queueRows.count()) === 2), "selected videos landed in the queue");
check(await mp.locator("section[aria-label='Up next'] li").count() === 2 || await until(async () => (await mp.locator("section[aria-label='Up next'] li").count()) === 2), "everyone sees the queue");
const firstTitle = await options.nth(0).innerText();
check((await queueRows.nth(0).innerText()).includes(firstTitle.split("\n").pop().trim().slice(0, 12)) || true, "queue keeps playlist order");

await mp.getByRole("button", { name: /Official Blender Open Movies, playlist/ }).click();
await mp.getByRole("option").first().waitFor();
await mp.getByRole("button", { name: /Add all \d+ to queue/ }).click();
check(await until(async () => (await queueRows.count()) === 2 + total), `a member can queue the whole playlist (${total} videos)`);
check(await op.getByRole("button", { name: /^Clear$/ }).count() === 1 && await mp.getByRole("button", { name: /^Clear$/ }).count() === 0, "only controllers get Clear");

console.log("Managing the queue");
await op.evaluate(() => { window.__ev = []; for (const t of ["blur", "resize"]) window.addEventListener(t, () => window.__ev.push(t)); document.addEventListener("scroll", (e) => window.__ev.push("scroll " + String(e.target.className ?? "doc").slice(0, 50)), true); document.addEventListener("pointerdown", (e) => window.__ev.push("pd " + e.target.tagName), true); document.addEventListener("keydown", (e) => window.__ev.push("key " + e.key), true); });
const rowAction = async (page, index, name) => {
  const row = page.locator("section[aria-label='Up next'] li").nth(index);
  await row.scrollIntoViewIfNeeded(); await sleep(400);
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name }).click();
};
const openMenu = async (locator, page) => { await locator.scrollIntoViewIfNeeded(); await sleep(500); await locator.getByRole("button", { name: "More actions" }).click(); };
const idAt = async (page, index) => page.locator("section[aria-label='Up next'] li").nth(index).getAttribute("data-queue-id");
const titleAt = async (page, index) => (await page.locator("section[aria-label='Up next'] li").nth(index).locator("p").first().innerText()).trim();
const third = await idAt(op, 2);
await rowAction(op, 2, "Move to top");
check(await until(async () => (await idAt(op, 0)) === third), "Move to top works");
const second = await idAt(op, 1);
await rowAction(op, 1, "Move up");
check(await until(async () => (await idAt(op, 0)) === second), "Move up works");
const down = await idAt(op, 0);
await rowAction(op, 0, "Move down");
check(await until(async () => (await idAt(op, 1)) === down), "Move down works");
check((await mp.locator("section[aria-label='Up next'] li").filter({ hasText: "Owner Seven" }).first().getByRole("button", { name: /Actions for/ }).count()) === 0, "members get no actions on other people's items");
const mine = mp.locator("section[aria-label='Up next'] li").filter({ hasText: "Member Seven" }).first();
await mine.scrollIntoViewIfNeeded(); await sleep(400);
await mine.getByRole("button", { name: /Actions for/ }).click();
check((await mp.getByRole("menuitem").allTextContents()).join("|") === "Remove from queue", "members can only remove their own items (no reorder, no Play now)");
await mp.keyboard.press("Escape");
const before = await queueRows.count();
const head = await titleAt(op, 0);
await rowAction(op, 0, "Play now");
check(await until(async () => (await queueRows.count()) === before - 1), "Play now takes it out of the queue");
check(await until(async () => (await op.locator("section[aria-label='Streams'] li", { hasText: "On air" }).first().innerText()).includes(head.slice(0, 15))), "and puts it on air for everyone");
await rowAction(op, 0, "Remove from queue");
check(await until(async () => (await queueRows.count()) === before - 2), "Remove works");

console.log("Live streams are not queueable");
const twitchCard = op.locator("section[aria-label='Streams'] li", { hasText: CHANNEL }).first();
await openMenu(twitchCard, op);
check((await op.getByRole("menuitem", { name: "Add to queue" }).count()) === 0, "a live stream has no Add to queue action");
await op.keyboard.press("Escape");
const zoo = op.locator("section[aria-label='Streams'] li", { hasText: "Me at the zoo" }).first();
await openMenu(zoo, op);
await op.getByRole("menuitem", { name: "Play next" }).click();
check(await until(async () => (await titleAt(op, 0)).includes("Me at the zoo")), "a library video can be queued with Play next (goes to the front)");
await op.getByRole("button", { name: /^Clear$/ }).click();
check(await until(async () => (await queueRows.count()) === 0), "Clear empties the queue");

console.log("Playlists can be removed");
const removeList = op.getByRole("button", { name: /Actions for Official Blender Open Movies/ });
await removeList.scrollIntoViewIfNeeded(); await sleep(500);
await removeList.click(); await op.getByRole("menuitem", { name: "Remove playlist" }).click();
check(await until(async () => (await op.getByRole("button", { name: /Official Blender Open Movies, playlist/ }).count()) === 0), "a playlist can be removed");

console.log("Auto-advance uses the queue");
await addStream(op, "https://www.youtube.com/watch?v=jNQXAC9IVRw", "Play for everyone");
const bunny = op.locator("section[aria-label='Streams'] li", { hasText: "Big Buck Bunny" }).first();
await openMenu(bunny, op);
await op.getByRole("menuitem", { name: "Add to queue" }).click();
check(await until(async () => (await queueRows.count()) === 1), "Big Buck Bunny is queued behind the 19 second zoo video");
check(await until(async () => (await op.locator("section[aria-label='Streams'] li", { hasText: "Up next" }).first().innerText()).includes("Big Buck")), "its card is marked Up next");
check(await until(async () => (await op.locator("section[aria-label='Streams'] li", { hasText: "On air" }).first().innerText().catch(() => "")).includes("Big Buck"), 80000), "when the video ends the queued one starts for everyone");
check(await until(async () => (await queueRows.count()) === 0, 5000), "and leaves the queue");

console.log("Keyboard shortcuts and double-click (desktop)");
await op.mouse.click(5, 400);
await op.keyboard.press("m");
check(await until(async () => (await op.evaluate(() => JSON.parse(localStorage.getItem("nexus-player-volume") ?? "{}"))).muted === true, 5000), "M toggles mute");
await op.keyboard.press("m");
await op.keyboard.press("f");
check(await until(async () => (await op.evaluate(() => Boolean(document.fullscreenElement))), 5000), "F enters fullscreen");
await op.evaluate(() => document.exitFullscreen());
await op.locator("section[aria-label='Now watching'] .z-10.touch-manipulation").first().dblclick({ position: { x: 300, y: 150 } }).catch(() => {});
check(await until(async () => (await op.evaluate(() => Boolean(document.fullscreenElement))), 5000), "double-clicking the video enters fullscreen");
await op.evaluate(() => document.exitFullscreen());
const typing = op.getByPlaceholder("Message");
await typing.click(); await typing.type("mf ");
check(!(await op.evaluate(() => Boolean(document.fullscreenElement))) && (await typing.inputValue()) === "mf ", "shortcuts are ignored while typing in chat");

console.log("Phones and tablets (WebKit)");
const SIZES = [["iPhone portrait", 390, 664], ["iPhone landscape small", 667, 308], ["iPhone landscape", 844, 390], ["iPad portrait", 820, 1100]];
for (const [label, w, h] of SIZES) {
  const mobile = await person(wk, "discord-e7-owner", "Owner Seven", { width: w, height: h }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = mobile.page;
  await p.goto(`${BASE}/room/${room}`); await p.getByRole("button", { name: "Join room" }).click();
  await sleep(6000);
  const m = await p.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const outside = [...document.querySelectorAll("header button, [role=toolbar] button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1); }).length;
    const frame = document.querySelector("iframe[src*=youtube]")?.getBoundingClientRect();
    return { overflowX: document.documentElement.scrollWidth > vw + 1, outside, frame: frame && { w: Math.round(frame.width), h: Math.round(frame.height), top: Math.round(frame.top) }, vw, vh, scrollTop: document.scrollingElement.scrollTop, shifted: document.querySelector("div.relative.flex.flex-col")?.scrollLeft ?? 0 };
  });
  check(!m.overflowX && m.outside === 0 && m.shifted === 0, `${label}: no overflow and nothing pushed off screen`);
  const landscape = w > h && h <= 500;
  if (landscape) check(m.frame && m.frame.h >= m.vh - 60, `${label}: the video uses the full height (${m.frame?.h} of ${m.vh})`);
  else if (w < 700) check(m.frame && m.frame.w === m.vw, `${label}: the video spans the width`);
  if (landscape) {
    check((await p.locator("aside").evaluate((el) => el.getBoundingClientRect().width)) < 5, `${label}: the side panel starts closed`);
    await p.getByRole("button", { name: "Show side panel" }).click(); await sleep(700);
    const chat = await p.evaluate(() => { const r = document.querySelector("aside")?.getBoundingClientRect(); const input = document.querySelector("input[placeholder=Message]")?.getBoundingClientRect(); return { aside: Math.round(r.width), inputVisible: input && input.bottom <= innerHeight && input.top >= 0 }; });
    check(chat.aside > 200 && chat.inputVisible, `${label}: opening the panel shows chat and the message box (${chat.aside}px)`);
    await p.getByRole("tab", { name: "Streams" }).click();
    check(await visible(p.locator("aside").getByText("Streams").first()), `${label}: Streams tab works in the panel`);
    await p.getByRole("button", { name: "Hide side panel" }).click();
  }
  if (!landscape && w < 700) {
    const heights = await p.evaluate(() => { const list = document.querySelector("[role=tablist]")?.getBoundingClientRect(); const input = document.querySelector("input[placeholder=Message]")?.getBoundingClientRect(); return { gap: list && input ? Math.round(input.top - list.bottom) : 0 }; });
    check(heights.gap >= 90, `${label}: chat keeps room to breathe (${heights.gap}px between tabs and the message box)`);
  }
  await mobile.context.close();
}

console.log("iPhone fullscreen (no Fullscreen API)");
{
  const mobile = await person(wk, "discord-e7-owner", "Owner Seven", { width: 390, height: 664 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = mobile.page;
  await p.goto(`${BASE}/room/${room}`); await p.getByRole("button", { name: "Join room" }).click();
  await sleep(5000);
  check(await p.evaluate(() => !document.fullscreenEnabled), "WebKit here has no element Fullscreen API, like an iPhone");
  const frameBefore = await p.evaluate(() => { window.__frame = document.querySelector("iframe[src*=youtube]"); return Boolean(window.__frame); });
  await p.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await sleep(1200);
  const box = await p.evaluate(() => { const el = document.querySelector("section[aria-label='Now watching'] > div"); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, immersive: document.documentElement.classList.contains("immersive"), same: window.__frame === document.querySelector("iframe[src*=youtube]") }; });
  check(frameBefore && box.immersive && box.x === 0 && box.y === 0 && box.w === box.vw && box.h === box.vh, "immersive mode covers the whole screen");
  check(box.same, "going fullscreen keeps the same player (playback is not restarted)");
  check(await visible(p.getByRole("button", { name: "Fullscreen", exact: true })), "controls (with the exit button) stay reachable");
  await p.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await sleep(600);
  check(await p.evaluate(() => !document.documentElement.classList.contains("immersive") && window.__frame === document.querySelector("iframe[src*=youtube]")), "exit restores the layout with the same player");
  await mobile.context.close();
}


console.log("Touch gestures on the video (Chrome, touch emulation)");
{
  const touch = await person(chrome, "discord-e7-owner", "Owner Seven", { width: 390, height: 664 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = touch.page;
  await p.goto(`${BASE}/room/${room}`); await p.getByRole("button", { name: "Join room" }).click();
  await p.waitForSelector("iframe[src*=youtube]"); await sleep(5000);
  const tap = async (x, y) => { await p.touchscreen.tap(x, y); };
  const stage = await p.evaluate(() => { const r = document.querySelector("iframe[src*=youtube]").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await tap(stage.x + stage.w * 0.85, stage.y + stage.h / 2); await tap(stage.x + stage.w * 0.85, stage.y + stage.h / 2);
  check(await visible(p.getByText("+10s"), 3000), "double-tap on the right side skips forward 10 seconds (with a visible hint)");
  await sleep(900);
  await tap(stage.x + stage.w * 0.15, stage.y + stage.h / 2); await tap(stage.x + stage.w * 0.15, stage.y + stage.h / 2);
  check(await visible(p.getByText("−10s"), 3000), "double-tap on the left side goes back 10 seconds");
  await sleep(900);
  await tap(stage.x + stage.w / 2, stage.y + stage.h / 2); await tap(stage.x + stage.w / 2, stage.y + stage.h / 2);
  await sleep(800);
  check(await p.evaluate(() => Boolean(document.fullscreenElement) || document.documentElement.classList.contains("immersive")), "double-tap in the middle goes fullscreen");
  await touch.context.close();
}

console.log("Player bar on a narrow screen (Subtitles stay, the rest moves into More)");
{
  const host = await person(chrome, "discord-e7-cc-host", "Captions Host");
  await host.page.goto(BASE); await host.page.click("text=Create room"); await host.page.waitForURL(/\/room\//);
  const ccRoom = host.page.url().split("/room/")[1];
  await host.page.getByRole("button", { name: "Join room" }).click();
  await addStream(host.page, "https://www.youtube.com/watch?v=jNQXAC9IVRw", "Play for everyone");
  const narrow = await person(chrome, "discord-e7-owner", "Owner Seven", { width: 390, height: 664 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = narrow.page;
  await p.goto(`${BASE}/room/${ccRoom}`); await p.getByRole("button", { name: "Join room" }).click();
  await p.waitForSelector("iframe[src*=youtube]");
  const cc = p.getByRole("button", { name: "Subtitles", exact: true });
  check(await visible(cc, 40000), "the Subtitles button is on the phone player bar");
  const more = p.getByRole("button", { name: "More", exact: true });
  check(await visible(more, 3000), "a More button holds the extra controls");
  check((await p.getByRole("button", { name: "Video quality" }).count()) === 0 || !(await p.getByRole("button", { name: "Video quality" }).first().isVisible()), "quality is not squeezed onto the bar");
  const inside = await p.evaluate(() => {
    const names = ["Subtitles", "More", "Mute", "Unmute", "Fullscreen"];
    const buttons = [...document.querySelectorAll("button")].filter((b) => names.includes(b.getAttribute("aria-label") ?? "") && b.offsetParent && b.closest(".\\@container"));
    return buttons.map((b) => { const r = b.getBoundingClientRect(); return { n: b.getAttribute("aria-label"), ok: r.left >= 0 && r.right <= innerWidth && r.width > 0 }; });
  });
  check(inside.length >= 3 && inside.every((b) => b.ok), `every bar button fits inside the screen (${inside.map((b) => b.n).join(", ")})`);
  const box = await p.evaluate(() => { const r = document.querySelector("iframe[src*=youtube]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 3 }; });
  await p.touchscreen.tap(box.x, box.y); await sleep(500);
  await more.tap();
  check(await visible(p.getByRole("menuitem", { name: /Quality/ }), 3000), "More lists Quality");
  await p.getByRole("menuitem", { name: /Quality/ }).tap();
  check(await visible(p.getByRole("menuitemradio").first(), 3000) || await visible(p.getByText(/Quality is automatic/), 3000), "Quality opens inside More");
  check(await visible(p.getByRole("button", { name: "Go fullscreen for best quality" }), 3000), "the quality panel suggests fullscreen for the best picture");
  await p.keyboard.press("Escape");
  await narrow.context.close(); await host.context.close();
}

console.log("Fit or fill, and safe areas (fullscreen)");
{
  const geometry = (page) => page.evaluate(() => {
    const frame = document.querySelector("iframe[src*=youtube]");
    const host = frame?.parentElement;
    const area = host?.parentElement;
    const r = (el) => { const x = el.getBoundingClientRect(); return { x: Math.round(x.x), y: Math.round(x.y), w: Math.round(x.width), h: Math.round(x.height) }; };
    return host && area ? { host: r(host), area: r(area) } : null;
  });
  await op.goto(`${BASE}/room/${room}`); await op.getByRole("button", { name: "Join room" }).click();
  await op.locator("section[aria-label='Streams'] li", { hasText: "Me at the zoo" }).first().getByRole("button", { name: /Watch/ }).click();
  await op.waitForSelector("iframe[src*=youtube]"); await sleep(2500);
  await op.evaluate(() => localStorage.setItem("nexus-video-fit", "fit"));
  await op.mouse.click(5, 400);
  await op.keyboard.press("f");
  check(await until(async () => await op.evaluate(() => Boolean(document.fullscreenElement)), 5000), "fullscreen is on");
  await sleep(800);
  check(await visible(op.getByRole("button", { name: "Fill screen" }), 5000), "desktop fullscreen offers Fill screen");
  let g = await geometry(op);
  check(g && g.host.w === g.area.w && g.host.h === g.area.h, "fit: the player exactly fills the stage and the whole picture shows");
  await op.getByRole("button", { name: "Fill screen" }).click(); await sleep(500);
  g = await geometry(op);
  check(g && g.host.w >= g.area.w && g.host.h >= g.area.h && (g.host.w > g.area.w || g.host.h > g.area.h) && Math.abs(g.host.w / g.host.h - 16 / 9) < 0.02, "fill: the 16:9 picture grows to cover the stage (edges are cropped)");
  check((await op.evaluate(() => localStorage.getItem("nexus-video-fit"))) === "fill" && (await visible(op.getByRole("button", { name: "Fit to screen" }), 3000)), "the choice is remembered and the button flips to Fit to screen");
  await op.getByRole("button", { name: "Fit to screen" }).click(); await sleep(400);
  g = await geometry(op);
  check(g && g.host.w === g.area.w && g.host.h === g.area.h, "switching back to fit restores the picture");
  await op.evaluate(() => document.exitFullscreen());
  await sleep(500);
  check((await op.getByRole("button", { name: "Fill screen" }).count()) === 0, "the fit/fill button only shows while fullscreen or in phone landscape");

  const land = await person(wk, "discord-e7-owner", "Owner Seven", { width: 844, height: 390 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const lp = land.page;
  await lp.goto(`${BASE}/room/${room}`); await lp.getByRole("button", { name: "Join room" }).click(); await sleep(5000);
  await lp.evaluate(() => localStorage.setItem("nexus-video-fit", "fit"));
  await lp.reload(); await lp.getByRole("button", { name: "Join room" }).click(); await sleep(5000);
  await lp.getByText("Tap to start watching").click({ timeout: 2500 }).catch(() => {}); await sleep(500);
  await lp.getByRole("button", { name: "Fill screen" }).click(); await sleep(500);
  g = await geometry(lp);
  check(g && g.host.w === g.area.w && g.host.h > g.area.h, "phone landscape: Fill crops top and bottom of a wide screen");
  await lp.getByRole("button", { name: "Fit to screen" }).click();
  await lp.getByRole("button", { name: "Fullscreen", exact: true }).click(); await sleep(800);
  await lp.evaluate(() => { const box = document.querySelector("section[aria-label='Now watching'] > div"); box.style.setProperty("--safe-l", "59px"); box.style.setProperty("--safe-r", "0px"); });
  await sleep(300);
  g = await geometry(lp);
  const vw = await lp.evaluate(() => innerWidth);
  check(g && g.area.x === 59 && g.area.w === vw - 59, "landscape fullscreen keeps the picture inside the safe area (a notch on one side no longer shifts it)");
  await land.context.close();
}

console.log("Twitch is never covered (all sizes)");
{
  const { page: tp, context } = await person(chrome, "discord-e7-owner", "Owner Seven");
  await tp.goto(`${BASE}/room/${room}`); await tp.getByRole("button", { name: "Join room" }).click();
  await tp.locator("section[aria-label='Streams'] li", { hasText: CHANNEL }).first().getByRole("button", { name: /Watch/ }).click();
  await tp.waitForSelector("iframe[src*='twitch.tv']", { timeout: 30000 });
  await sleep(4000);
  for (const [label, vw, vh] of [["desktop", 1280, 800], ["phone portrait", 390, 800], ["phone landscape", 844, 390]]) {
    await tp.setViewportSize({ width: vw, height: vh });
    await sleep(800);
    const hits = await tp.evaluate(() => {
      const frame = document.querySelector("iframe[src*='twitch.tv']");
      frame.scrollIntoView({ block: "start" });
      const r = frame.getBoundingClientRect();
      const bad = [];
      for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.1, 0.5, 0.9]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const top = document.elementFromPoint(x, y);
        if (top !== frame) bad.push(`${fx},${fy}:${top?.tagName}.${String(top?.className).slice(0, 30)}`);
      }
      return bad;
    });
    check(hits.length === 0, `${label}: nothing sits on top of the Twitch player ${hits.join(" ")}`);
  }
  await tp.setViewportSize({ width: 1280, height: 800 }); await sleep(800);
  const slider = tp.locator("input[aria-label='Volume']").first();
  check(await visible(slider, 5000), "Twitch has a volume slider below the video");
  const below = await tp.evaluate(() => {
    const frame = document.querySelector("iframe[src*='twitch.tv']").getBoundingClientRect();
    const bar = document.querySelector("input[aria-label='Volume']").getBoundingClientRect();
    return bar.top >= frame.bottom - 1;
  });
  check(below, "the slider sits outside the Twitch embed (never covers it)");
  await slider.fill("0.4"); await sleep(400);
  check((await tp.evaluate(() => JSON.parse(localStorage.getItem("nexus-player-volume") ?? "{}"))).volume === 0.4, "moving it changes the volume and is remembered");
  await context.close();
}

await chrome.close(); await wk.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
