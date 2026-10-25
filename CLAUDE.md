# Nexus Lounge

Virtual watch-party PWA: rooms with LiveKit voice/chat/screen share, synced YouTube and Twitch playback, queue, roles, TV mode. General purpose (League of Legends Worlds is only a one-line mention in the README).

## Layout
- `apps/web`: Next.js 16 (App Router), React 19, Tailwind 4, Auth.js v5 (Discord + guest credentials).
- `apps/server`: Fastify 5 + `ws`. Rooms live in memory; WebSocket protocol validated with zod.
- `packages/shared`: types, `protocol.ts`, sync maths, URL parsing, PTT, volume curve, sound cues.

## Commands
- `pnpm install`, `pnpm dev` (web 3000, server 4000), `pnpm typecheck`, `pnpm build`
- `pnpm --filter @nexus/shared test`, `pnpm --filter @nexus/server test`
- `pnpm livekit` runs LiveKit locally (Docker; stop it when not needed).

## Conventions
- TypeScript strict. Node runs `.ts` directly, so imports use the `.ts` extension and only erasable syntax is allowed (no enums, no parameter properties).
- Validate every WebSocket message with the zod schemas in `packages/shared/src/protocol.ts`. Enforce permissions on the server and in the LiveKit grant, never only in the UI.
- Match surrounding code: few comments, small components, Apple-style UI (restrained, rounded, blur, system font).
- Sheets and popovers render through portals (popovers into the fullscreen element when active).

## Layout variants
- `pl:` = phone landscape (short, landscape, under 1024px wide). `compact:` = phone portrait or phone landscape. Defined in `globals.css`; use them instead of `max-sm:`/`landscape:` so the two phone orientations stay in sync.
- Use container queries (`@container`, `@md:`) inside the player controls: the stage can be narrow because of the side panel, not because of the viewport.
- Use `overflow-clip`, not `overflow-hidden`, on layout shells: hidden containers can be scrolled by focus and shift the whole app sideways on iOS.
- Fullscreen boxes set `--safe-l/--safe-r` (notch insets); the player and share area offset themselves with them so the picture stays centred in the visible area. Fit/Fill (`useVideoFit`) scales the YouTube host with container query units (`cqw/cqh`) rather than `object-fit`, because the iframe is cross-origin.
- Menus use `Popover` (portal, fixed); never position dropdowns inside cards.

## Gotchas
- **Never overlay a Twitch embed.** Twitch pauses playback if anything covers it. Tear down and recreate the Twitch player on every stream switch.
- YouTube embeds cannot be told a quality (the write APIs are no-ops); the player's pixel size drives what YouTube serves. Reads work. Captions use an undocumented module, so guard every call (`safe()`).
- Per-stream clock: `{position, playing, updatedAt}`; correct drift with playback rate first, seek rarely and debounced.
- Screen share stream ids are `screen:<identity>`.
- iPhone has no Fullscreen API for elements: `useStageFullscreen` falls back to an immersive CSS mode. Decide at creation time, never rebuild a YouTube iframe (iOS blocks autoplay on a new one): on devices without the API, viewers who cannot control the stream get YouTube's own controls (`fs=1`, whose fullscreen button opens the native iOS player); controllers keep our synced controls. Twitch always shows its own controls. Screen shares call `video.webkitEnterFullscreen()`. Cross-origin iframes can't be sent to native fullscreen programmatically.
- Twitch needs 400x300: smaller stages scale the whole embed down (`TwitchAdapter` ResizeObserver) instead of cropping its controls.
- Join state: everyone joins muted and deafened; `LiveKitRoom audio={false}` so the mic is only requested on unmute.
- Queue: `room.queue` is explicit (`queue.*` messages); with an empty queue `queue.advance` falls back to library order. Playlists are YouTube only, scraped server-side from the playlist page (`playlists.ts`, no API key), items are sent on demand with `playlist.open`.
- TV output: the TV is a guest member whose ticket carries `tvOf` (the owner id). `useTvOutput` (per-room localStorage choice: here/tv/both) drives `Stage`, `StreamPlayer` and `VoiceAudio`; "tv only" sets the local player `visible=false`, "both" mutes this device until the user turns sound on. With no TV connected the mode falls back to "here".
- Player bar: below `@md` Quality, Fit/Fill and AirPlay collapse into `MoreMenu`; Subtitles always stay on the bar.
- Accounts: no database. Profile edits (name, preset avatar from `public/avatars`) are stored in the Auth.js JWT via `unstable_update({ profile })` and applied in the `session` callback. `/account` can delete the account: the web route calls server `POST /account/delete`, which refuses (409 `in_room`) while the user is connected to any room and otherwise forgets them (`rooms.forgetUser`), then the session is cleared. Public pages `/terms` and `/privacy` back the links Discord requires; update their dates when behaviour changes.
- Admin (`/admin`): live read-only overview of rooms and people. Needs `ADMIN_SECRET`, `ADMIN_DISCORD_IDS` (web + server) and `ADMIN_TOTP_SECRET` (web); with any missing it is off and the server route is not registered. Layers: allowlisted Discord session (guests never) + TOTP code (single use per step, 5 tries per 5 min) -> 30 min `__Host-admin` cookie -> the web app mints a 60 s single-use token (`aud: admin`, own verifier in `packages/shared/src/admin-token.ts`) for the server's `GET /admin/overview`. Every failure is the stock 404. The overview is built field by field in `rooms.adminOverview` (never spread room/member objects; names stripped of invisible characters). Keep `/admin` and `/api/admin` out of the service worker and cache. Actions (close a room, remove a person): the request token carries a structured `act` bound to one operation; members are addressed by an opaque HMAC `ref` (no IDs leave the server); the web route additionally needs same-origin `Sec-Fetch-Site`, `Origin` equal to `AUTH_URL`, a CSRF header derived from the admin cookie, JSON content type, and an admin cookie issued in the last 5 minutes (else it asks for a fresh code). The host can't be removed (close the room instead). Removing someone also drops TVs they paired; LiveKit leftovers are cleaned by `reconcileVoice` every 30 s.
- `useWakeLock` keeps the screen on in rooms and TV mode (Screen Wake Lock API, re-acquired on visibility change).
- Production sits behind Cloudflare (proxied, SSL Full). Rate limits use `clientIp(request)` (`apps/server/src/client-ip.ts`), which trusts `CF-Connecting-IP` only from Cloudflare's ranges; the Railway addresses still work directly with `TRUST_PROXY_HOPS=2`. `www` and the old Railway web address redirect to the apex in `next.config.ts`; HSTS (6 months, no preload) is sent from there too. See `docs/railway-deploy.md`.
- `NEXT_PUBLIC_*` values are baked at build time; `SERVER_WS_URL` is the runtime override.
- iCloud can create `* 2.ts` duplicates inside `.next`; tsconfig excludes them.
- Rooms vanish on server restart; keep a single server instance.

## Secrets and deploy
- Never commit `.env`, `.env.railway` or `.tmp-*` (all ignored). `.env.example` is the only env file in git.
- `main` is protected (applies to admins too): changes go through a branch and a pull request, the `check` CI job must pass, no force-pushes or deletion. Squash-merge with `gh pr merge --squash --delete-branch`.
- Railway services `server` and `web` are connected to GitHub and deploy on every push to `main`. Config templates and steps: `docs/railway-deploy.md`, `docs/railway/`.

## Tests
`pnpm --filter @nexus/shared test`, `pnpm --filter @nexus/server test`, and the browser suites in `e2e/` (`cd e2e && node run.mjs`; see its README). Add an e2e check for UI behaviour, and assert geometry (rects, `elementFromPoint`) rather than eyeballing screenshots.

## Manual testing
Run server and web with a LiveKit instance and Discord keys, or use guest login. Use two browser windows in one room. `AUTH_SECRET` must match between web and server.
