import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "playwright-core";
import { launch, newPage, sleep } from "../lib.mjs";
import { mintSession } from "../session.mjs";
import { ffmpegAvailable, makeFixtures, makeHevc, startLinkHost, startStremioMock } from "../stremio-mock.mjs";

// Magnet links, Stremio stream links and video links, with a mock Stremio server and mock link hosts.
// Needs LiveKit (pnpm livekit) and ffmpeg. STREMIO_REAL=1 also runs a real magnet through the Stremio app on this computer.
const BASE = process.env.BASE ?? "http://localhost:3001";
const here = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (ok, label) => { results.push({ ok, label }); console.log(ok ? "  ✓" : "  ✗ FAIL", label); };
const until = async (fn, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(300); } return false; };

if (!ffmpegAvailable()) { console.log("  (skipped: ffmpeg is needed to make the test videos)"); process.exit(0); }
let svc;
try {
  const { RoomServiceClient } = createRequire(join(here, "..", "..", "apps", "server", "package.json"))("livekit-server-sdk");
  svc = new RoomServiceClient("http://localhost:7880", process.env.LIVEKIT_API_KEY ?? "devkey", process.env.LIVEKIT_API_SECRET ?? "secret");
  await svc.listRooms();
} catch { console.log("  (skipped: LiveKit isn't running on :7880, start it with pnpm livekit)"); process.exit(0); }

const fx = makeFixtures(join(here, "..", ".tmp-fixtures"));
if (process.env.STREMIO_REAL) fx.realHevc = makeHevc(join(here, "..", ".tmp-fixtures"));
const stremio = await startStremioMock(11571, fx);
const wrong = await startStremioMock(11573, fx, { wrongSize: true });
const links = await startLinkHost(11572, fx);
const GOOD = "http://127.0.0.1:11571";
const NONE = "http://127.0.0.1:11999";
const HASH = "aabbccddeeff00112233445566778899aabbccdd";
const SECRET = "SECRETTOKEN123";
const link = (path) => `http://127.0.0.1:11572${path}?psig=${SECRET}`;

const browser = await launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const person = async (sub, name, base, room, extra = {}) => {
  const entry = await newPage(browser, { width: 1280, height: 800 });
  await entry.context.addCookies([await mintSession(sub, name)]);
  await entry.page.addInitScript(([address, forced]) => { localStorage.setItem("nexus-stremio-server", address); if (forced) localStorage.setItem("nexus-stremio-force", forced); window.__pcs = []; const N = window.RTCPeerConnection; window.RTCPeerConnection = function (...a) { const pc = new N(...a); window.__pcs.push(pc); return pc; }; window.RTCPeerConnection.prototype = N.prototype; }, [base, extra.force ?? ""]);
  entry.sent = [];
  entry.page.on("websocket", (ws) => ws.on("framesent", (frame) => entry.sent.push(String(frame.payload))));
  if (room) { await entry.page.goto(`${BASE}/room/${room}`); await entry.page.getByRole("button", { name: "Join room" }).click(); }
  return entry;
};
const inList = (page) => page.locator('section[aria-label="Streams"]');
const playing = (page, src) => page.evaluate((prefix) => { const v = [...document.querySelectorAll("video")].find((el) => { const s = el.currentSrc || el.src || ""; return !el.srcObject && (prefix === "converted" ? s.startsWith("blob:") || s.includes("/hlsv2/") : s.startsWith(prefix)); }); return v ? { t: v.currentTime, paused: v.paused, w: v.videoWidth } : null; }, src);
const feedVideo = (page) => page.evaluate(() => { const v = [...document.querySelectorAll("video")].find((el) => el.srcObject); return v ? { w: v.videoWidth, t: v.currentTime } : null; });
const closed = (p) => p.getByRole("tab", { name: "Stremio / link" }).waitFor({ state: "detached", timeout: 60000 });
const openAdd = async (p) => { await p.getByRole("button", { name: /Add a stream|Add$/ }).first().click(); await p.getByRole("tab", { name: "Stremio / link" }).click(); };
const paste = async (p, text) => { const input = p.getByLabel("Magnet, Stremio stream link or video link"); await input.fill(text); await input.press("Enter"); };

const owner = await person("discord-sm-owner", "Owner", GOOD);
const p = owner.page;
await p.goto(BASE); await p.click("text=Create room"); await p.waitForURL(/\/room\//);
const room = p.url().split("/room/")[1];
await p.getByRole("button", { name: "Join room" }).click();

console.log("Who sees the tab");
const member = await person("discord-sm-member", "Member", GOOD, room);
await member.page.getByRole("button", { name: /Add a stream|Add$/ }).first().click();
check((await member.page.getByRole("tab", { name: "Stremio / link" }).count()) === 0, "members who aren't controllers don't get the Stremio tab");
await member.page.keyboard.press("Escape");

console.log("Adding a magnet");
await openAdd(p);
await paste(p, `magnet:?xt=urn:btih:${HASH.toUpperCase()}&dn=Test%20Film&tr=${encodeURIComponent("udp://tracker.opentrackr.org:1337/announce")}&tr=${encodeURIComponent("udp://127.0.0.1:9")}`);
check(await until(async () => (await p.getByText(/^Ready\./).count()) > 0, 30000), "a magnet opens in Stremio and is checked");
check((await p.getByLabel("Which video in the torrent").count()) === 1, "a torrent with several videos lets you pick one");
check(await p.getByText(/plays straight in your browser/i).isVisible(), "a web-friendly file says it plays straight in the browser");
const create = stremio.state.creates.at(-1);
check(JSON.stringify(create).includes("opentrackr") && !JSON.stringify(create).includes("127.0.0.1:9"), "private trackers never reach Stremio");
await p.getByRole("button", { name: "Play for everyone" }).click();
await closed(p);
check(await until(async () => { const v = await playing(p, GOOD); return v && !v.paused && v.t > 1; }, 30000), "the owner's Stremio plays it");
check((await p.getByText("Stremio", { exact: true }).count()) > 0, "the stream is badged Stremio");

console.log("Subtitles");
const shown = (page) => page.evaluate(() => { const v = [...document.querySelectorAll("video")].find((el) => !el.srcObject && el.textTracks.length && !el.closest("[aria-hidden=true]")); const t = v && [...v.textTracks].find((x) => x.mode === "showing"); return t ? { label: t.label, cues: t.cues?.length ?? 0, text: t.cues?.[0]?.text ?? "" } : null; });
check(await until(async () => { const s = await shown(p); return s && s.cues > 0 && s.text.includes("Torrent subtitle"); }, 20000), "a subtitle file that came with the torrent shows by itself in the viewer's language");
await p.getByRole("button", { name: "Subtitles" }).click();
check((await p.getByRole("menuitemradio").allTextContents()).some((text) => /English/.test(text)), "the Subtitles menu lists it");
check((await p.getByRole("menuitem", { name: "Find subtitles online…" }).count()) === 1 && (await p.getByRole("menuitem", { name: "Add a subtitle file…" }).count()) === 1, "and offers a file and an online search");
await p.getByRole("menuitemradio", { name: "Off" }).click();
check(await until(async () => (await shown(p)) === null), "Off hides the subtitles");
check((await p.evaluate(() => localStorage.getItem("nexus-subtitles"))) === "off", "and remembers that choice on this device");
await p.getByRole("button", { name: "Subtitles" }).click();
await p.getByRole("menuitemradio", { name: /English/ }).click();
check(await until(async () => ((await shown(p))?.cues ?? 0) > 0), "picking a track shows it again");
await p.getByRole("button", { name: "Subtitles" }).click();
await p.getByRole("button", { name: "Large", exact: true }).click();
check(await p.evaluate(() => [...document.querySelectorAll("video")].some((v) => v.dataset.subSize === "1")), "the text size can be changed");
await p.keyboard.press("Escape");

console.log("A friend without Stremio watches the live feed");
const bob = await person("discord-sm-bob", "Bob", NONE, room);
check(await until(async () => { const v = await feedVideo(bob.page); return v && v.w > 0; }, 30000), "the picture arrives from the owner's browser");
check(await inList(bob.page).getByRole("button", { name: /Play with my Stremio/ }).isVisible(), "the list offers Play with my Stremio");
check(await bob.page.getByText("Watching Owner's live feed").isVisible(), "and says whose live feed is being watched");
check((await bob.page.getByRole("button", { name: "Subtitles" }).count()) === 0, "live feed viewers have no subtitle menu (the feed is picture and sound only)");
await inList(bob.page).getByRole("button", { name: /Play with my Stremio/ }).click();
check(await until(async () => (await inList(bob.page).getByText(/Stremio|reach|connect/i).filter({ hasText: /Couldn't reach|Open the Stremio app/ }).count()) > 0, 20000), "without Stremio running it explains how to fix that");
check((await playing(bob.page, GOOD)) === null && (await feedVideo(bob.page))?.w > 0, "and the live feed keeps playing");

console.log("A friend with Stremio plays it themselves");
const cara = await person("discord-sm-cara", "Cara", GOOD, room);
await inList(cara.page).getByRole("button", { name: /Play with my Stremio/ }).click();
check(await until(async () => { const v = await playing(cara.page, GOOD); return v && v.w > 0 && !v.paused; }, 40000), "Play with my Stremio starts their own copy");
check(await until(async () => Math.abs(((await playing(cara.page, GOOD))?.t ?? -99) - ((await playing(p, GOOD))?.t ?? 99)) < 2.5), "it stays on the room clock with the owner");
check(await until(async () => (await inList(cara.page).getByText(/50% downloaded/).count()) > 0, 15000), "download progress shows in the list");
check(await inList(cara.page).getByRole("button", { name: /Use live feed/ }).isVisible(), "they can go back to the live feed");

console.log("A different file is refused");
const dan = await person("discord-sm-dan", "Dan", "http://127.0.0.1:11573", room);
await inList(dan.page).getByRole("button", { name: /Play with my Stremio/ }).click();
check(await until(async () => (await dan.page.getByText(/isn't the same file/).count()) > 0, 20000), "a copy with a different size is blocked");
check((await playing(dan.page, "http://127.0.0.1:11573")) === null, "and nothing plays from it");

console.log("Safari-style limits");
const insecure = await person("discord-sm-ines", "Ines", GOOD, room, { force: "insecure" });
await inList(insecure.page).getByRole("button", { name: /Play with my Stremio/ }).click();
check(await until(async () => { const v = await playing(insecure.page, "converted"); return v && v.w > 0; }, 40000), "when the browser blocks Stremio checks it still plays the stream");

console.log("The TV uses the live feed");
const tv = await newPage(browser, { width: 1920, height: 1080 });
await tv.context.addCookies([await mintSession("discord-sm-owner", "Owner")]);
await tv.page.goto(`${BASE}/room/${room}/tv`);
await tv.page.getByRole("button", { name: "Start watching" }).click({ timeout: 20000 }).catch(() => {});
check(await until(async () => { const v = await feedVideo(tv.page); return v && v.w > 0; }, 30000), "a paired TV shows the picture");

console.log("Links: the address stays private");
await p.keyboard.press("Escape");
await openAdd(p);
await paste(p, link("/ok.webm"));
check(await until(async () => (await p.getByText(/^Ready\./).count()) > 0, 30000), "a direct link is checked from the browser");
check(await p.getByText(/plays straight in your browser/i).isVisible(), "and plays straight in the browser");
check(((await p.getByLabel("Name everyone will see").inputValue()) === "ok"), "the name comes from the address, not the token");
await p.getByRole("button", { name: "Add to library" }).click();
await closed(p);
check(await until(async () => (await inList(bob.page).getByText("ok", { exact: true }).count()) > 0, 15000), "friends see it in the list");
check(owner.sent.some((frame) => frame.includes('"type":"link"')) && !owner.sent.some((frame) => frame.includes(SECRET)), "the link's token never leaves the owner's browser");
check(!(await bob.page.content()).includes(SECRET) && !(await cara.page.content()).includes(SECRET), "and never shows up for anyone else");

console.log("Links that need Stremio");
const addLink = async (path, expectReady = true) => {
  await openAdd(p);
  await paste(p, link(path));
  if (expectReady) await p.getByText(/^Ready\./).waitFor({ timeout: 40000 });
};
await addLink("/nocors.webm");
check(await p.getByText(/converted so every browser can play it/i).isVisible(), "a link the browser can't read goes through Stremio");
await p.getByRole("button", { name: "Add to library" }).click();
await closed(p);
await addLink("/hevc.mkv");
check(await p.getByText(/converted so every browser can play it/i).isVisible(), "a format browsers can't decode goes through Stremio");
await p.getByRole("button", { name: "Play for everyone" }).click();
await closed(p);
check(await until(async () => { const v = await playing(p, "converted"); return v && v.w > 0 && !v.paused && v.t > 1; }, 45000), "and plays through the converted stream");

console.log("Subtitles inside a video");
await addLink("/subs.webm");
await p.getByRole("button", { name: "Play for everyone" }).click();
await closed(p);
await p.getByRole("button", { name: "Subtitles" }).click();
check(await until(async () => (await p.getByRole("menuitemradio", { name: /Fran/ }).count()) > 0, 20000), "tracks inside the video are listed through Stremio");
await p.getByRole("menuitemradio", { name: /Fran/ }).click();
check(await until(async () => { const s = await shown(p); return s && s.cues >= 2 && s.text.includes("Embedded first"); }, 20000), "and shown, with every segment of the track joined");

console.log("Finding subtitles online");
const cors = { "access-control-allow-origin": "*" };
await p.route("https://v3-cinemeta.strem.io/**", (route) => route.fulfill({ headers: cors, json: route.request().url().includes("/movie/") ? { metas: [{ id: "tt1727587", imdb_id: "tt1727587", name: "Sintel", releaseInfo: "2010" }] } : { metas: [] } }));
await p.route("https://opensubtitles-v3.strem.io/**", (route) => route.fulfill({ headers: cors, json: { subtitles: [{ id: "1", url: "https://subs.test/1.srt", lang: "eng" }, { id: "2", url: "http://insecure.test/2.srt", lang: "eng" }] } }));
await p.route("https://subs.test/**", (route) => route.fulfill({ headers: { ...cors, "content-type": "application/x-subrip" }, body: "1\n00:00:00,500 --> 00:59:00,000\nOnline subtitle line\n" }));
await p.getByRole("button", { name: "Subtitles" }).click();
await p.getByRole("menuitem", { name: "Find subtitles online…" }).click();
const sheet = p.getByRole("dialog", { name: "Find subtitles" });
await sheet.getByLabel("Movie or series title").fill("Sintel");
await sheet.getByRole("button", { name: "Search" }).click();
await sheet.getByRole("button", { name: /Sintel \(2010\)/ }).click();
await sheet.getByRole("button", { name: "English" }).click();
check(await until(async () => { const s = await shown(p); return s && s.text.includes("Online subtitle line"); }, 15000), "a subtitle found by title shows for this viewer");
check((await sheet.count()) === 0, "and the search closes");
check(!owner.sent.some((frame) => frame.includes("Online subtitle") || frame.includes("subs.test")), "nothing about subtitles is sent to the room");

console.log("A subtitle file from the computer");
await p.getByRole("button", { name: "Subtitles" }).click();
const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("menuitem", { name: "Add a subtitle file…" }).click()]);
await chooser.setFiles({ name: "Movie.fr.srt", mimeType: "application/x-subrip", buffer: Buffer.from("\ufeff1\r\n00:00:00,200 --> 00:50:00,000\r\n<i>Fichier de sous-titres</i>\r\n") });
check(await until(async () => { const s = await shown(p); return s && s.text.includes("Fichier de sous-titres") && !s.text.includes("<font"); }, 10000), "a .srt from the computer shows");
await p.getByRole("button", { name: "Subtitles" }).click();
check((await p.getByRole("menuitemradio", { name: "French" }).count()) === 1, "and is listed by its language");
await p.keyboard.press("Escape");
check(stremio.state.hlsServed > 0, "the playlist came from Stremio");

console.log("Links that look wrong");
await addLink("/placeholder.webm");
check(await p.getByText(/very short clip/i).isVisible(), "a tiny error clip gets a warning");
await paste(p, link("/expired.webm"));
check(await until(async () => (await p.getByRole("alert").filter({ hasText: /expired|doesn't work/ }).count()) > 0, 30000), "an expired link says so");
await p.keyboard.press("Escape");
const lone = await person("discord-sm-lone", "Lone", NONE);
await lone.page.goto(BASE); await lone.page.click("text=Create room"); await lone.page.waitForURL(/\/room\//);
await lone.page.getByRole("button", { name: "Join room" }).click();
await openAdd(lone.page);
await paste(lone.page, link("/nocors.webm"));
check(await until(async () => (await lone.page.getByRole("alert").filter({ hasText: /Open Stremio/ }).count()) > 0, 30000), "a link that needs Stremio says so when it isn't running");
await paste(lone.page, `magnet:?xt=urn:btih:${HASH}`);
check(await until(async () => (await lone.page.getByRole("alert").filter({ hasText: /Couldn't reach Stremio/ }).count()) > 0, 30000), "a magnet without Stremio explains what to do");

console.log("Friends use their own link");
await cara.page.reload(); await cara.page.getByRole("button", { name: "Join room" }).click();
const card = (page, title) => inList(page).locator("li").filter({ has: page.getByText(title, { exact: true }) });
const target = card(cara.page, "ok");
await target.getByRole("button", { name: /I have this video/ }).click();
await cara.page.getByLabel("Video link or magnet").fill(`http://127.0.0.1:11572/alt/ok.webm?other=${SECRET}`);
await cara.page.getByRole("button", { name: "Use this link" }).click();
check(await until(async () => (await target.getByText("Playing your copy").count()) > 0, 40000), "a different link to the same video becomes their own copy");
await cara.page.getByRole("button", { name: "Watch ok" }).click();
const caraOk = await until(async () => { const v = await playing(cara.page, "http://127.0.0.1:11572"); return v && v.w > 0; }, 30000);
check(caraOk, "and it opens in their player");

console.log("A different video is refused");
const eve = await person("discord-sm-eve", "Eve", GOOD, room);
const eveCard = card(eve.page, "ok");
await eveCard.getByRole("button", { name: /I have this video/ }).click();
await eve.page.getByLabel("Video link or magnet").fill(link("/short.webm"));
await eve.page.getByRole("button", { name: "Use this link" }).click();
check(await until(async () => (await eve.page.getByRole("alert").filter({ hasText: /different video/ }).count()) > 0, 30000), "a link to another video is blocked");
await eve.page.keyboard.press("Escape");

console.log("Replacing an expired link");
await card(p, "hevc").getByRole("button", { name: /Replace the link/ }).click();
await p.getByLabel("Video link or magnet").fill(`http://127.0.0.1:11572/alt/ok.webm?fresh=${SECRET}`);
await p.getByRole("button", { name: "Replace link" }).click();
check(await until(async () => { const v = await playing(p, "http://127.0.0.1:11572"); return v && v.w > 0 && !v.paused; }, 40000), "the owner keeps playing from the fresh link");
check(await until(async () => { const v = await feedVideo(bob.page); return v && v.w > 0; }, 30000), "friends watching the live feed never lose the picture");
await card(p, "hevc").getByRole("button", { name: /Replace the link/ }).waitFor();
check(!owner.sent.some((frame) => frame.includes("fresh=")), "the fresh link isn't sent to the room either");

console.log("Refresh and queue");
await p.reload(); await p.getByRole("button", { name: "Join room" }).click();
check(await until(async () => { const v = await playing(p, "http://127.0.0.1:11572"); return v && v.w > 0; }, 60000), "a stream you were playing comes back after a refresh");
await inList(p).locator("li").first().getByRole("button", { name: "More actions" }).click();
check((await p.getByRole("menuitem", { name: /Add to queue/ }).count()) === 0, "these streams can't be queued");
await p.keyboard.press("Escape");

console.log("A phone");
const wk = await webkit.launch();
const phoneCtx = await wk.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, colorScheme: "dark" });
await phoneCtx.addCookies([await mintSession("discord-sm-phone", "Phone")]);
const phone = await phoneCtx.newPage();
await phone.addInitScript((address) => localStorage.setItem("nexus-stremio-server", address), NONE);
await phone.goto(`${BASE}/room/${room}`);
await phone.getByRole("button", { name: "Join room" }).click();
await phone.getByRole("tab", { name: "Streams" }).click();
await sleep(1500);
const geometry = await phone.evaluate(() => ({ scroll: document.documentElement.scrollWidth <= innerWidth + 1, buttons: [...document.querySelectorAll('section[aria-label="Streams"] button')].filter((b) => /Stremio|video/.test(b.textContent ?? "") && b.getBoundingClientRect().height > 0).map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim().slice(0, 30), ok: r.left >= -1 && r.right <= innerWidth + 1 && r.height >= 36, l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) }; }) }));
if (!geometry.buttons.every((b) => b.ok)) console.log("   buttons:", JSON.stringify(geometry.buttons));
check(geometry.scroll, "the page doesn't scroll sideways");
check(geometry.buttons.length > 0 && geometry.buttons.every((b) => b.ok), "the buttons fit the screen and are tall enough to tap");
await wk.close();

if (process.env.STREMIO_REAL) {
  console.log("A real magnet through the real Stremio");
  const SINTEL = "08ada5a7a6183aae1e09d831df6748d566095a10";
  const real = await person("discord-sm-real", "Real", "http://127.0.0.1:11470");
  await real.page.goto(BASE); await real.page.click("text=Create room"); await real.page.waitForURL(/\/room\//);
  const realRoom = real.page.url().split("/room/")[1];
  await real.page.getByRole("button", { name: "Join room" }).click();
  await openAdd(real.page);
  await paste(real.page, `magnet:?xt=urn:btih:${SINTEL}&dn=Sintel&tr=${encodeURIComponent("udp://tracker.opentrackr.org:1337/announce")}&tr=${encodeURIComponent("udp://open.demonii.com:1337/announce")}`);
  check(await until(async () => (await real.page.getByText(/^Ready\./).count()) > 0, 150000), "the real Stremio opens a real magnet");
  check(((await real.page.getByText(/14 min|15 min/).count()) > 0), "and reports the film's length");
  await real.page.getByRole("button", { name: "Play for everyone" }).click();
  check(await until(async () => { const v = await playing(real.page, "http://127.0.0.1:11470"); return v && v.w > 0 && !v.paused && v.t > 2; }, 120000), "it plays from the swarm");
  const watcher = await person("discord-sm-watch", "Watcher", NONE, realRoom);
  check(await until(async () => { const v = await feedVideo(watcher.page); return v && v.w > 0; }, 60000), "a friend without Stremio watches it through the live feed");
  if (fx.realHevc) {
    console.log("A link the browser can't play, converted by the real Stremio");
    await real.page.keyboard.press("Escape").catch(() => {});
    await openAdd(real.page);
    await paste(real.page, link("/real-hevc.mkv"));
    check(await until(async () => (await real.page.getByText(/^Ready\./).count()) > 0, 120000), "the real Stremio reads an HEVC and E-AC3 file");
    check(await real.page.getByText(/converted so every browser can play it/i).isVisible(), "and says it will convert it");
    await real.page.getByRole("button", { name: "Play for everyone" }).click();
    await closed(real.page);
    check(await until(async () => { const v = await playing(real.page, "converted"); return v && v.w > 0 && !v.paused && v.t > 2; }, 150000), "the converted stream plays with sound and picture");
    const hasAudio = await real.page.evaluate(() => { const v = [...document.querySelectorAll("video")].find((el) => (el.currentSrc || "").startsWith("blob:")); return v ? { decoded: v.webkitAudioDecodedByteCount ?? null, muted: v.muted } : null; });
    check(hasAudio !== null && hasAudio.decoded > 0, "the sound is decoding too (E-AC3 became AAC)");
    check(await until(async () => { const v = await feedVideo(watcher.page); return v && v.w > 0; }, 60000), "friends see it through the live feed");
  } else {
    console.log("  (skipped the converted stream: this ffmpeg has no x265/eac3 encoder)");
  }
  await fetch(`http://127.0.0.1:11470/${SINTEL}/remove`).catch(() => {});
}

stremio.close(); wrong.close(); links.close();
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
