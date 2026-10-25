# End-to-end suites

Browser tests that drive real Chrome (and WebKit for the iPhone checks) against a running stack: rooms, guests, voice states, push to talk, fullscreen, sound cues, Twitch switching, join by code, the playlist queue, gestures and phone layouts.

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
