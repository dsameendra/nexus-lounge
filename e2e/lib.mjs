import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const CANDIDATES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

// System Chrome is used because Chromium builds without proprietary codecs can't play YouTube.
export const CHROME = CANDIDATES.find((path) => path && existsSync(path)) ?? "";

export async function launch(opts = {}) {
  if (!CHROME) throw new Error("Chrome not found. Install Google Chrome or set CHROME=/path/to/chrome.");
  return chromium.launch({
    executablePath: CHROME,
    headless: !process.env.HEADED,
    args: ["--disable-blink-features=AutomationControlled", ...(opts.strictAutoplay ? [] : ["--autoplay-policy=no-user-gesture-required"]), ...(opts.args ?? [])],
  });
}

export async function newPage(browser, viewport = { width: 1280, height: 800 }, extra = {}) {
  const context = await browser.newContext({ viewport, colorScheme: "dark", ...extra });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log("  [pageerror]", String(error.message).slice(0, 160)));
  return { context, page };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A speech-like signal for Chrome's fake microphone: two tones with a syllable-rate amplitude envelope.
export function speechWav() {
  const path = join(tmpdir(), "nexus-e2e-speech.wav");
  if (existsSync(path)) return path;
  const rate = 48000;
  const seconds = 12;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const envelope = 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * 3.2 * t));
    const value = envelope * (0.55 * Math.sin(2 * Math.PI * 180 * t) + 0.35 * Math.sin(2 * Math.PI * 540 * t) + 0.1 * Math.sin(2 * Math.PI * 1500 * t));
    data.writeInt16LE(Math.round(value * 0.6 * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
  return path;
}

export async function guestJoin(page, base, room, name, query = "") {
  await page.goto(`${base}/login?callbackUrl=${encodeURIComponent(`/room/${room}${query}`)}`);
  await page.fill("input[name=name]", name);
  await page.click("text=Continue as guest");
  await page.getByRole("button", { name: "Join room" }).waitFor({ timeout: 40000 });
  await page.getByRole("button", { name: "Join room" }).click();
}
