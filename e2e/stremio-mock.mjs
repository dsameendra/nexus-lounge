import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Stands in for the Stremio streaming server (create / stream / stats / probe / HLS) and for the hosts that links point at.
export function ffmpegAvailable() {
  return spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
}

function durationOf(path) {
  const run = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path]);
  return Number(String(run.stdout).trim());
}

export function makeFixtures(dir) {
  const out = (name) => join(dir, name);
  const make = (name, args) => {
    if (!existsSync(out(name))) {
      const run = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args, out(name)]);
      if (run.status !== 0) throw new Error(`ffmpeg failed for ${name}: ${run.stderr}`);
    }
  };
  const webm = (secs, size, hz, bitrate) => ["-f", "lavfi", "-i", `testsrc2=size=${size}:rate=25`, "-f", "lavfi", "-i", `sine=frequency=${hz}:sample_rate=48000`, "-t", String(secs), "-c:v", "libvpx", "-b:v", bitrate, "-c:a", "libopus", "-shortest"];
  make("film.webm", webm(60, "640x360", 440, "600k"));
  make("short.webm", webm(6, "320x180", 260, "200k"));
  make("placeholder.webm", webm(2, "160x90", 200, "20k"));
  if (!existsSync(out("hls/index.m3u8"))) {
    spawnSync("mkdir", ["-p", out("hls")]);
    const run = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", out("film.webm"), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod", "-hls_segment_filename", out("hls/seg%d.ts"), out("hls/index.m3u8")]);
    if (run.status !== 0) throw new Error(`ffmpeg hls failed: ${run.stderr}`);
  }
  return {
    film: { path: out("film.webm"), size: statSync(out("film.webm")).size, duration: durationOf(out("film.webm")) },
    short: { path: out("short.webm"), size: statSync(out("short.webm")).size, duration: durationOf(out("short.webm")) },
    placeholder: { path: out("placeholder.webm"), size: statSync(out("placeholder.webm")).size, duration: durationOf(out("placeholder.webm")) },
    hls: out("hls"),
  };
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type, range", "access-control-expose-headers": "content-length, content-range, accept-ranges" };

function sendFile(req, res, file, headers = {}, type = "video/webm") {
  const data = readFileSync(file);
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = Math.min(range[2] ? Number(range[2]) : data.length - 1, data.length - 1);
    res.writeHead(206, { ...headers, "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${data.length}`, "content-length": end - start + 1 });
    res.end(req.method === "HEAD" ? undefined : data.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { ...headers, "content-type": type, "accept-ranges": "bytes", "content-length": data.length });
  res.end(req.method === "HEAD" ? undefined : data);
}

// wrongSize makes this server report a different file, to prove a mismatch is refused.
export function startStremioMock(port, fx, { wrongSize = false } = {}) {
  const state = { creates: [], streamed: 0, hlsServed: 0 };
  const hash = /^\/([a-f0-9]{40})\/(\d+)(\/stats\.json)?$/;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === "OPTIONS") return void res.writeHead(204, { ...CORS, "access-control-max-age": "600" }).end();
    const json = (body, status = 200) => void res.writeHead(status, { ...CORS, "content-type": "application/json" }).end(JSON.stringify(body));
    if (url.pathname === "/settings") return json({ options: [], values: {} });
    const create = url.pathname.match(/^\/([a-f0-9]{40})\/create$/);
    if (create && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        state.creates.push(JSON.parse(body || "{}"));
        json({
          infoHash: create[1],
          name: "Test Film",
          peers: 4,
          files: [
            { path: "Test Film/Test.Film.en.srt", name: "Test.Film.en.srt", length: 1500, offset: 0 },
            { path: "Test Film/Test Film.webm", name: "Test Film.webm", length: wrongSize ? fx.film.size + 7 : fx.film.size, offset: 1500 },
            { path: "Test Film/Sample.webm", name: "Sample.webm", length: fx.short.size, offset: 3000 },
          ],
        });
      });
      return;
    }
    const file = url.pathname.match(hash);
    if (file) {
      if (file[3]) return json({ streamProgress: 0.5, downloadSpeed: 1_500_000, peers: 7, streamLen: fx.film.size });
      state.streamed++;
      return sendFile(req, res, file[2] === "2" ? fx.short.path : fx.film.path, CORS);
    }
    if (url.pathname === "/hlsv2/probe") {
      const media = decodeURIComponent(url.searchParams.get("mediaURL") ?? "");
      if (media.includes("expired")) return void res.writeHead(500, CORS).end("error");
      const hevc = media.includes("hevc");
      const duration = media.includes("placeholder") ? fx.placeholder.duration : media.endsWith("/2") || media.includes("short") ? fx.short.duration : fx.film.duration;
      return json({
        format: { name: "matroska,webm", duration },
        streams: [
          { track: "video", codec: hevc ? "hevc" : "vp8", width: 640, height: 360 },
          { track: "audio", codec: hevc ? "eac3" : "opus", channels: 2 },
        ],
      });
    }
    const hls = url.pathname.match(/^\/hlsv2\/[^/]+\/(master\.m3u8|seg\d+\.ts)$/);
    if (hls) {
      state.hlsServed++;
      const name = hls[1] === "master.m3u8" ? "index.m3u8" : hls[1];
      return sendFile(req, res, join(fx.hls, name), CORS, name.endsWith("m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t");
    }
    res.writeHead(404, CORS).end();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ state, close: () => server.close() })));
}

// A 10-bit HEVC + E-AC3 Matroska file like the ones debrid links serve: browsers can't play it, so the real Stremio has to convert it.
export function makeHevc(dir) {
  const path = join(dir, "real-hevc.mkv");
  if (existsSync(path)) return path;
  const run = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000", "-t", "20", "-c:v", "libx265", "-pix_fmt", "yuv420p10le", "-x265-params", "log-level=error", "-c:a", "eac3", "-ac", "2", "-shortest", path]);
  return run.status === 0 ? path : null;
}

// Hosts that links point at: one that allows browsers, one that doesn't, an expired one, a placeholder clip, a redirect.
export function startLinkHost(port, fx) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const path = url.pathname;
    if (req.method === "OPTIONS") return void res.writeHead(204, CORS).end();
    if (path === "/ok.webm" || path === "/alt/ok.webm") return sendFile(req, res, fx.film.path, CORS);
    if (path === "/hevc.mkv") return sendFile(req, res, fx.film.path, CORS);
    if (path === "/real-hevc.mkv" && fx.realHevc) return sendFile(req, res, fx.realHevc, CORS, "application/octet-stream");
    if (path === "/nocors.webm") return sendFile(req, res, fx.film.path, {});
    if (path === "/short.webm") return sendFile(req, res, fx.short.path, CORS);
    if (path === "/placeholder.webm") return sendFile(req, res, fx.placeholder.path, CORS);
    if (path === "/redirect.webm") return void res.writeHead(307, { ...CORS, location: `http://127.0.0.1:${port}/ok.webm` }).end();
    if (path === "/expired.webm") return void res.writeHead(403, CORS).end("expired");
    res.writeHead(404, CORS).end();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ close: () => server.close() })));
}
