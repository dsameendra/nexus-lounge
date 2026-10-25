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
- `useWakeLock` keeps the screen on in rooms and TV mode (Screen Wake Lock API, re-acquired on visibility change).
- `NEXT_PUBLIC_*` values are baked at build time; `SERVER_WS_URL` is the runtime override.
- iCloud can create `* 2.ts` duplicates inside `.next`; tsconfig excludes them.
- Rooms vanish on server restart; keep a single server instance.

## Secrets and deploy
- Never commit `.env`, `.env.railway` or `.tmp-*` (all ignored). `.env.example` is the only env file in git.
- Railway services `server` and `web` are connected to GitHub and deploy on every push to `main`. Config templates and steps: `docs/railway-deploy.md`, `docs/railway/`.

## Tests
`pnpm --filter @nexus/shared test`, `pnpm --filter @nexus/server test`, and the browser suites in `e2e/` (`cd e2e && node run.mjs`; see its README). Add an e2e check for UI behaviour, and assert geometry (rects, `elementFromPoint`) rather than eyeballing screenshots.

## Manual testing
Run server and web with a LiveKit instance and Discord keys, or use guest login. Use two browser windows in one room. `AUTH_SECRET` must match between web and server.
