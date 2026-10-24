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

Against production, pass the deployed secret through `AUTH_SECRET_OVERRIDE` without echoing it, and set the three cookie variables for the web domain.

The suites use real YouTube and Twitch embeds, so they need internet access. Screenshots land in `e2e/.out/` (ignored by git).
