# Nexus Lounge

Watch League of Legends streams with friends in a shared room: Discord-style voice chat, text chat, and (in later milestones) screen share and synced YouTube/Twitch playback.

Status: **Milestone 3** — Discord or guest login, optional room passwords, rooms with invite links, LiveKit voice, text chat, participant list with speaking indicators, and tab/screen sharing with audio.

## Layout

```
apps/web         Next.js app (UI, Discord login via Auth.js, thin API routes)
apps/server      Fastify + ws (rooms in memory, LiveKit token endpoint, WS protocol)
packages/shared  zod schemas and types shared by both
```

## Requirements

Node 22.18+ (the server runs TypeScript directly), pnpm 10+, and Docker only if you self-host LiveKit locally.

## Setup

1. `pnpm install`
2. `cp .env.example .env` and fill it in (below).
3. `pnpm dev`, then open http://localhost:3000.

`pnpm dev` starts the web app (port 3000) and the server (port 4000). For local LiveKit, run `pnpm livekit` in another terminal, or use LiveKit Cloud instead.

### Discord credentials

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Under **OAuth2**, copy the Client ID into `DISCORD_CLIENT_ID` and reset/copy the Client Secret into `DISCORD_CLIENT_SECRET`.
3. Add the redirect URL `http://localhost:3000/api/auth/callback/discord` (add your production URL the same way).
4. Generate `AUTH_SECRET` with `openssl rand -base64 32`.

### LiveKit credentials

- **Local (default in `.env.example`)**: `pnpm livekit` runs LiveKit in dev mode with key `devkey` and secret `secret`, at `ws://localhost:7880`.
- **LiveKit Cloud**: create a project at [cloud.livekit.io](https://cloud.livekit.io), then copy the WebSocket URL (`wss://….livekit.cloud`) into `LIVEKIT_URL` and an API key/secret pair from **Settings → Keys** into `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.

## Watching together

- **Streams library:** anyone signed in with Discord can paste a YouTube or Twitch link (video, live stream, channel or past broadcast) into **Add**. Every stream keeps its own shared clock on the server, so people can watch different streams at the same time and switch between them without losing sync.
- **Featured ("On air") stream:** the host and controllers pick what the room watches. Guests always follow it; Discord users follow it by default and can pick any other stream, then **Join them** to come back.
- **Controls:** play, pause and seek on a stream are limited to the host, controllers, and whoever added that stream. The host can promote other Discord users to controller from the People tab.
- **Guests** can talk, chat and watch the featured stream. They can't add streams, share their screen, create rooms or pick another stream (enforced on the server and in the LiveKit token).
- **Sync:** each client estimates the server clock (median of ping samples) and compares its player to `position + elapsed`. To avoid a choppy picture it never reacts to a single reading: drift is the median of the last few samples, and a short grace period follows every seek or buffer stall. Small drift is fixed by gently changing the playback speed (0.95/1.05 where available, otherwise YouTube's 0.75/1.25, which pitch-corrects). A seek only happens when the player is far off (over ~2.5s with rate control, ~1.5s without, as on Twitch) and stays off for more than a second, or right away when a controller seeks. Each seek learns how long the player takes to resume and aims slightly ahead to compensate. Add `?debug` to a room URL to see the live numbers.
- **Twitch live** cannot be seeked by embeds, so it can't be time-synced; the UI says so and suggests screen share.
- **Titles:** YouTube titles are fetched server-side from YouTube's public oEmbed endpoint (no key needed); everything else falls back to the channel name or id.

## Tests

`pnpm --filter @nexus/shared test` (URL parsing, drift maths, tokens) and `pnpm --filter @nexus/server test` (spawns the server and checks permissions, late joiners, tickets and passwords over real WebSockets).

## How it works

- The browser never talks to the server directly with your Discord session. Next API routes sign a 5-minute HMAC token (using `AUTH_SECRET`) and call the Fastify server, which verifies it.
- `POST /rooms` creates a room (the creator is host). `POST /rooms/:id/livekit-token` returns a LiveKit token for that room plus the LiveKit URL.
- Voice, speaking indicators, presence and chat all run through LiveKit (chat uses data channels).
- The `/ws` WebSocket validates every message with zod (`packages/shared/src/protocol.ts`). In Milestone 1 it only handles `join` and `ping`; playback sync lands in Milestone 3.
- Rooms live in server memory and vanish on restart. Redis is the planned future step for persistence and multiple server instances.

## Env vars

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | web | Discord OAuth |
| `AUTH_SECRET` | web, server | Auth.js session encryption and server token signing (must match) |
| `AUTH_URL` | web | Public URL of the web app |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | server | LiveKit connection and token minting |
| `NEXT_PUBLIC_SERVER_WS_URL` | web | WebSocket URL of the Fastify server (the HTTP URL is derived from it) |
| `PORT` | server | Server port (default 4000) |

## Deploy

Web: Vercel or Railway, with all variables above except `PORT`. Server: Railway (`pnpm --filter @nexus/server start`), with `AUTH_SECRET` and the LiveKit variables. Set `NEXT_PUBLIC_SERVER_WS_URL` to the server's public `wss://…/ws` URL.
