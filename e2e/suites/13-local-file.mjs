import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "playwright-core";
import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";

// Needs the whole stack including LiveKit (pnpm livekit) and ffmpeg for the two test videos.
const BASE = process.env.BASE ?? "http://localhost:3001";
const here = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const until = async (fn, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; };

const fixtures = join(here, "..", ".tmp-fixtures");
mkdirSync(fixtures, { recursive: true });
const make = (name, pattern, hz) => {
  const path = join(fixtures, name);
  if (!existsSync(path)) {
    const run = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `${pattern}=size=640x360:rate=25`, "-f", "lavfi", "-i", `sine=frequency=${hz}:sample_rate=48000`, "-t", "60", "-c:v", "libvpx", "-b:v", "600k", "-c:a", "libopus", "-shortest", path]);
    if (run.status !== 0) return null;
  }
  return readFileSync(path).toString("base64");
};
const fileA = make("film-a.webm", "testsrc2", 440);
const fileB = make("film-b.webm", "smptebars", 330);
if (!fileA || !fileB) {
  console.log("  (skipped: ffmpeg is needed to make the test videos)");
  process.exit(0);
}

let svc = null;
try {
  const { RoomServiceClient } = createRequire(join(here, "..", "..", "apps", "server", "package.json"))("livekit-server-sdk");
  svc = new RoomServiceClient("http://localhost:7880", process.env.LIVEKIT_API_KEY ?? "devkey", process.env.LIVEKIT_API_SECRET ?? "secret");
  await svc.listRooms();
} catch {
  console.log("  (skipped: LiveKit isn't running on :7880, start it with pnpm livekit)");
  process.exit(0);
}

// A fake file picker backed by the page's private file system, so remembered files can be tested too.
const picker = ([a, b]) => {
  window.__which = "a";
  window.__pcs = [];
  const Native = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...args) { const pc = new Native(...args); window.__pcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = Native.prototype;
  window.showOpenFilePicker = async () => {
    const data = Uint8Array.from(atob(window.__which === "a" ? a : b), (c) => c.charCodeAt(0));
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(`film-${window.__which}.webm`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return [handle];
  };
};

const browser = await launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const join_ = async (sub, name, room) => {
  const entry = await newPage(browser, { width: 1280, height: 800 });
  await entry.context.addCookies([await mintSession(sub, name)]);
  await entry.page.addInitScript(picker, [fileA, fileB]);
  if (room) {
    await entry.page.goto(`${BASE}/room/${room}`);
    await entry.page.getByRole("button", { name: "Join room" }).click();
  }
  return entry;
};

const owner = await join_("discord-local-owner", "Owner");
const p = owner.page;
await p.goto(BASE);
await p.click("text=Create room");
await p.waitForURL(/\/room\//);
const room = p.url().split("/room/")[1];
await p.getByRole("button", { name: "Join room" }).click();

console.log("Adding a file");
await p.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
await p.getByRole("tab", { name: "Video file" }).click();
await p.getByRole("button", { name: /Choose a video file/ }).click();
check(await until(async () => (await p.getByText("Ready").count()) > 0), "a picked file is checked and marked ready");
check(await p.getByText(/isn't uploaded/).isVisible(), "the add dialog says the video isn't uploaded and the name is shared");
await p.getByRole("button", { name: "Play for everyone" }).click();
const localVideo = (page) => page.evaluate(() => { const v = document.querySelector('video[src^="blob:"]'); return v ? { t: v.currentTime, paused: v.paused, w: v.videoWidth } : null; });
check(await until(async () => { const v = await localVideo(p); return v && !v.paused && v.t > 1; }), "the owner's own copy plays");
check((await p.getByText("File", { exact: true }).count()) > 0, "the stream is badged as a file");

console.log("A friend watches the live feed");
const bob = await join_("discord-local-bob", "Bob", room);
const feedVideo = (page) => page.evaluate(() => { const v = [...document.querySelectorAll("video")].find((el) => el.srcObject); return v ? { w: v.videoWidth, t: v.currentTime, paused: v.paused } : null; });
check(await until(async () => { const v = await feedVideo(bob.page); return v && v.w > 0; }, 30000), "a friend without the file receives the picture");
const t1 = (await feedVideo(bob.page))?.t ?? 0;
await sleep(2000);
check(((await feedVideo(bob.page))?.t ?? 0) > t1 + 1, "the picture keeps moving");
check((await bob.page.getByText(/is sharing/).count()) === 0, "the feed is not shown as a screen share");
check(await bob.page.getByText("I have this file").isVisible(), "the friend can switch to their own copy");
check(await p.getByText(/Sharing live/).isVisible(), "the owner is told the live feed is on");
const published = async () => (await svc.listParticipants(room)).find((x) => x.identity === "discord-local-owner")?.tracks.filter((t) => t.name?.startsWith("file:")).length ?? 0;
check((await published()) === 2, "the owner publishes a picture and a sound track");

console.log("Sound does not follow the owner's own volume");
const energy = (page) => page.evaluate(async () => {
  let best = 0;
  for (const pc of window.__pcs) for (const s of (await pc.getStats()).values()) if (s.type === "inbound-rtp" && s.kind === "audio") best = Math.max(best, s.totalAudioEnergy ?? 0);
  return best;
});
await bob.page.getByRole("button", { name: "Undeafen" }).first().click();
await sleep(1500);
const before = await energy(bob.page);
await sleep(2000);
const flowing = await energy(bob.page);
console.log("   energy", before, flowing);
if (!(flowing > before)) {
  console.log("   audio stats:", JSON.stringify(await bob.page.evaluate(async () => {
    const out = [];
    for (const pc of window.__pcs) for (const s of (await pc.getStats()).values()) if (s.type === "inbound-rtp" && s.kind === "audio") out.push({ packets: s.packetsReceived, bytes: s.bytesReceived, energy: s.totalAudioEnergy, level: s.audioLevel, samples: s.totalSamplesReceived, concealed: s.concealedSamples });
    return { pcs: window.__pcs.length, out, audios: [...document.querySelectorAll("audio")].map((a) => ({ paused: a.paused, muted: a.muted, vol: a.volume, hasStream: Boolean(a.srcObject) })) };
  })));
  console.log("   owner audio ctx:", JSON.stringify(await p.evaluate(() => ({ pcs: window.__pcs.length }))));
}
check(flowing > before, "the friend hears the film");
await p.locator('button[aria-label="Mute"]').last().click();
check(await p.locator('button[aria-label="Unmute"]').count() > 0, "the owner can mute their own speakers");
const e1 = await energy(bob.page);
await sleep(2500);
check((await energy(bob.page)) > e1 + 0.0001, "the friend still hears the film after the owner mutes");

console.log("Controls reach everyone");
await p.keyboard.press("Escape");
const seek = await p.evaluate(async () => {
  const input = document.querySelector('input[aria-label="Seek"]');
  return Boolean(input);
});
check(seek, "the owner has a seek bar");
await p.locator('input[aria-label="Seek"]').first().evaluate((el) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "30");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});
check(await until(async () => (await localVideo(p))?.t > 29), "a seek moves the owner's copy");

console.log("A friend with the file plays it locally");
const cara = await join_("discord-local-cara", "Cara", room);
await cara.page.mouse.move(400, 300);
await cara.page.getByRole("button", { name: "I have this file" }).click();
check(await until(async () => { const v = await localVideo(cara.page); return v && v.w > 0 && !v.paused; }, 25000), "picking the same file starts it locally");
check(await until(async () => Math.abs(((await localVideo(cara.page))?.t ?? -99) - ((await localVideo(p))?.t ?? 99)) < 2), "it stays on the room clock with the owner");

console.log("A different file is refused");
const dan = await join_("discord-local-dan", "Dan", room);
await dan.page.evaluate(() => { window.__which = "b"; });
await dan.page.mouse.move(400, 300);
await dan.page.getByRole("button", { name: "I have this file" }).click();
check(await until(async () => (await dan.page.getByText(/isn't the same file/).count()) > 0), "a different file is blocked with a clear message");
check((await localVideo(dan.page)) === null, "nothing plays from the wrong file");

console.log("Nothing is sent while everyone has the file");
await bob.page.mouse.move(400, 300);
await bob.page.getByRole("button", { name: "I have this file" }).click();
await bob.page.getByText("Playing your copy").waitFor({ timeout: 15000 });
await dan.page.close();
check(await until(async () => (await published()) === 0, 30000), "the owner stops publishing once nobody needs the feed");
await bob.page.mouse.move(420, 320);
await bob.page.getByRole("button", { name: /use live feed/ }).click();
check(await until(async () => (await published()) === 2, 20000), "and starts again when someone goes back to the feed");

console.log("The TV uses the live feed");
const tv = await newPage(browser, { width: 1920, height: 1080 });
await tv.context.addCookies([await mintSession("discord-local-owner", "Owner")]);
await tv.page.goto(`${BASE}/room/${room}/tv`);
await tv.page.getByRole("button", { name: "Start watching" }).click({ timeout: 20000 }).catch(() => {});
check(await until(async () => { const v = await feedVideo(tv.page); return v && v.w > 0; }, 30000), "a paired TV shows the picture");

console.log("A refresh brings the file back");
await p.reload();
await p.getByRole("button", { name: "Join room" }).click();
check(await until(async () => { const v = await localVideo(p); return v && v.w > 0; }, 30000), "the remembered file reopens by itself");
check(await until(async () => (await published()) === 2, 30000), "and the live feed comes back for the friends who need it");

console.log("An iPhone-sized WebKit viewer");
const wk = await webkit.launch();
const phoneContext = await wk.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, colorScheme: "dark" });
await phoneContext.addCookies([await mintSession("discord-local-phone", "Phone")]);
const phone = await phoneContext.newPage();
await phone.goto(`${BASE}/room/${room}`);
await phone.getByRole("button", { name: "Join room" }).click();
check(await until(async () => phone.evaluate(() => { const v = [...document.querySelectorAll("video")].find((el) => el.srcObject); return Boolean(v) && v.videoWidth > 0; }), 40000), "Safari's engine receives the live feed");
await sleep(1500);
const fit = await phone.evaluate(() => {
  const bar = document.querySelector('input[aria-label="Seek"]')?.closest(".bg-panel, .material");
  const rect = bar?.getBoundingClientRect();
  return { scroll: document.documentElement.scrollWidth <= window.innerWidth + 1, bar: rect ? rect.left >= -1 && rect.right <= window.innerWidth + 1 : null, seek: Boolean(document.querySelector('input[aria-label="Seek"]')) };
});
check(fit.scroll, "the page doesn't scroll sideways");
check(fit.seek && fit.bar === true, "the player bar fits inside the screen");
await wk.close();

console.log("A Safari-engine owner shares a file");
const mp4 = join(fixtures, "film-c.mp4");
if (!existsSync(mp4)) spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25", "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=48000", "-t", "40", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mp4]);
if (existsSync(mp4)) {
  const wk2 = await webkit.launch();
  const wkContext = await wk2.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
  await wkContext.addCookies([await mintSession("discord-local-safari", "Safari Owner")]);
  const sp = await wkContext.newPage();
  await sp.goto(BASE);
  await sp.click("text=Create room");
  await sp.waitForURL(/\/room\//);
  const room2 = sp.url().split("/room/")[1];
  await sp.getByRole("button", { name: "Join room" }).click();
  await sp.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
  await sp.getByRole("tab", { name: "Video file" }).click();
  const [chooser] = await Promise.all([sp.waitForEvent("filechooser"), sp.getByRole("button", { name: /Choose a video file/ }).click()]);
  await chooser.setFiles(mp4);
  const ready = await until(async () => (await sp.getByText("Ready").count()) > 0, 20000);
  check(ready, "Safari's engine accepts an MP4 file");
  if (ready) {
    await sp.getByRole("button", { name: "Play for everyone" }).click();
    const viewer = await join_("discord-local-viewer2", "Viewer Two", room2);
    check(await until(async () => { const v = await feedVideo(viewer.page); return v && v.w > 0; }, 40000), "a Chrome viewer receives the picture from the canvas route");
    await viewer.page.getByRole("button", { name: "Undeafen" }).first().click();
    await sleep(1500);
    const a = await energy(viewer.page);
    await sleep(2500);
    check((await energy(viewer.page)) > a, "and hears the film");
  }
  await wk2.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
