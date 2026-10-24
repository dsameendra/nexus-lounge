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

## Gotchas
- **Never overlay a Twitch embed.** Twitch pauses playback if anything covers it. Tear down and recreate the Twitch player on every stream switch.
- YouTube embeds cannot be told a quality (the write APIs are no-ops); the player's pixel size drives what YouTube serves. Reads work. Captions use an undocumented module, so guard every call (`safe()`).
- Per-stream clock: `{position, playing, updatedAt}`; correct drift with playback rate first, seek rarely and debounced.
- Screen share stream ids are `screen:<identity>`.
- iPhone has no Fullscreen API: `useStageFullscreen` falls back to an immersive CSS mode.
- `NEXT_PUBLIC_*` values are baked at build time; `SERVER_WS_URL` is the runtime override.
- iCloud can create `* 2.ts` duplicates inside `.next`; tsconfig excludes them.
- Rooms vanish on server restart; keep a single server instance.

## Secrets and deploy
- Never commit `.env`, `.env.railway` or `.tmp-*` (all ignored). `.env.example` is the only env file in git.
- Railway services `server` and `web` are connected to GitHub and deploy on every push to `main`. Config templates and steps: `docs/railway-deploy.md`, `docs/railway/`.

## Manual testing
Run server and web with a LiveKit instance and Discord keys, or use guest login. Use two browser windows in one room. The Playwright harness used during development (fake mic and screen capture, minted Auth.js session cookies) lives outside the repo; `AUTH_SECRET` must match between web and server.
