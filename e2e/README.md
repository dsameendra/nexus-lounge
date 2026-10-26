# End-to-end suites

Browser tests that drive real Chrome (and WebKit for the iPhone checks) against a running stack: rooms, guests, voice states, push to talk, fullscreen, sound cues, Twitch switching, Kick channels (`15-kick.mjs`, with a stubbed Kick player so it needs no internet), join by code, the playlist queue, gestures and phone layouts.

They sign in by minting an Auth.js session cookie, so no Discord account is needed. The web app and the server must share the same `AUTH_SECRET`.

## Run

```bash
cd e2e
npm install
npx playwright-core install webkit     # only the iPhone-style checks need WebKit

# local stack on :3000 (pnpm dev, or build + start); AUTH_SECRET is read from ../.env
node run.mjs                 # every suite
node run.mjs queue layouts   # suites whose file name contains one of these words
```

| Variable | Purpose | Default |
| --- | --- | --- |
| `BASE` | Web app URL | `http://localhost:3001` |
| `AUTH_SECRET` / `AUTH_SECRET_OVERRIDE` | Secret used to mint cookies | `AUTH_SECRET` from `../.env` |
| `COOKIE_DOMAIN`, `COOKIE_SECURE=1`, `COOKIE_SALT=__Secure-authjs.session-token` | Needed for an https deployment | localhost values |
| `CHROME` | Path to Chrome | auto-detected |
| `TWITCH_CHANNEL` | A live, non-region-locked channel for the Twitch suite (it skips itself if offline) | `xqc` |

Against production, pass the deployed secret through `AUTH_SECRET_OVERRIDE` without echoing it, and set the three cookie variables for the web domain.

The suites use real YouTube and Twitch embeds, so they need internet access. Screenshots land in `e2e/.out/` (ignored by git).

## Admin suite

`12-admin.mjs` needs a stack started with the admin variables, and skips itself otherwise: set `ADMIN_SECRET` (32+ chars), `ADMIN_DISCORD_IDS=123456789012345678` and `ADMIN_TOTP_SECRET=<base32>` on web and server, then run with `ADMIN_TOTP_SECRET_TEST=<same base32>`.

## Local video files

`13-local-file.mjs` needs LiveKit on :7880 (`pnpm livekit`) and `ffmpeg` (it makes two small test videos in `e2e/.tmp-fixtures/`, which is ignored by git); it skips itself otherwise. It covers the live feed, playing your own copy, refusing a wrong file, on-demand publishing, the TV, remembered files, an iPhone-sized WebKit viewer and a Safari-engine owner.

## TV output

`09-tv-output.mjs` covers the here/tv/both choice, the paired TV, and the TV's fullscreen button and `F` key.

## Stremio, magnets and links

`14-stremio.mjs` needs LiveKit and `ffmpeg`. It starts a mock Stremio server (:11571, and :11573 that reports a different file) and a mock link host (:11572), so it never touches a Stremio you have installed. It covers magnets and the file picker, friends with and without Stremio, mismatch refusal, the Safari-style fallback, the TV, every kind of link (direct, no CORS, HEVC, placeholder, expired, replaced, refreshed), token privacy (no WebSocket frame contains the link), a phone layout, Matroska direct play with the automatic fallback to Stremio's playlist when the file can't be decoded (the fallback check needs a browser with a Matroska demuxer and reads the `nexus-debug` console log), and subtitles (the file that came with a torrent, tracks inside the video, online search, a `.srt` from the computer, size and Off). One person can add only 5 device streams, so a suite that adds more needs a second owner. `STREMIO_REAL=1` also adds a real magnet (Sintel) through the Stremio app on :11470 and a real HEVC + E-AC3 conversion; it needs internet and ffmpeg with x265.
