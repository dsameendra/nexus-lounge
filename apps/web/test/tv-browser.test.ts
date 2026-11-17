import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { isTvBrowser } from "../lib/tv-browser.ts";
import { stubGlobal } from "./globals.ts";

let restore = () => {};
afterEach(() => restore());
const as = (userAgent: string) => {
  restore = stubGlobal("navigator", { userAgent });
  return isTvBrowser();
};

test("TV and set-top box browsers are recognised", () => {
  assert.equal(as("Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36"), true);
  assert.equal(as("Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager"), true);
  assert.equal(as("Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.88 Mobile Safari/537.36"), true);
  assert.equal(as("Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2 Build/STT1.211025.001.Z4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"), true);
  assert.equal(as("Mozilla/5.0 (Linux; Android 11; SHIELD Android TV Build/RQ1A.210105.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 Safari/537.36"), true);
  assert.equal(as("Roku/DVP-12.0 (12.0.0.4182-88)"), true);
});

test("phones, tablets and computers are not", () => {
  assert.equal(as("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"), false);
  assert.equal(as("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), false);
  assert.equal(as("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"), false);
  assert.equal(as("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"), false);
});

test("no navigator means no TV", () => {
  restore = stubGlobal("navigator", undefined);
  assert.equal(isTvBrowser(), false);
});
