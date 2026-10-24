# Nexus Lounge

A web app for watching things together online: a shared room with voice chat, text chat, synced YouTube and Twitch playback, and screen sharing. It installs as an app on phones and desktops, and has a TV mode for the big screen.

I built it so my friends and I could watch League of Legends Worlds together, but it's general purpose and works for any virtual watch party: sports, premieres, VODs, movie nights.

## What you can do

**Rooms and people**
- Create a named room and share the invite link. Sign in with Discord, or join as a guest.
- Guests wait in a lobby until the room owner lets them in. The owner can also remove anyone, who then can't rejoin.
- Room settings (owner): room name, guest policy (ask / let in / not allowed), lock the room, who may share their screen, auto-play next, and reactions on or off.
- Optional room password.
- Roles: the owner can make other Discord users controllers, who can pick what the room watches, control playback, reorder the queue, put a screen share on air, and stop someone's screen share.

**Watching**
- Paste any YouTube or Twitch link (video, live stream, channel, past broadcast) to add it to the room's stream list, and reorder it as a queue. When a video ends, the next one starts (a controller needs to be watching).
- Every stream has its own shared clock, so some people can watch one stream while others watch another, and anyone can switch without losing sync. The owner or a controller can put one stream "on air" for everyone; guests always follow it.
- Playback stays in sync across everyone's devices, with smooth correction instead of constant skipping.
- On a live YouTube stream, **Go live** jumps everyone to the live edge.
- Several people can screen share at once, each with audio. Everyone picks which share to watch, and the owner or a controller can put one on air. A notice appears when someone starts sharing.
- Twitch live channels can't be time-synced by embeds, so the app says so and suggests screen share.
- Reactions: send emoji that float across the screen for everyone.

**Playback controls**
- Subtitles on YouTube (language list from the video, on/off, text size), remembered between videos.
- Quality: the real list on Twitch, Auto/High/Low on screen shares. YouTube no longer lets embedded players choose a quality, so the menu says so.
- Volume: a perceptual curve, truly silent at the bottom, remembered between sessions.
- AirPlay: screen shares offer the AirPlay picker where Safari supports it; for YouTube and Twitch (which can't be sent to AirPlay directly) the TV sheet explains how to mirror the clean TV view to an Apple TV.

**Voice and chat**
- Always-on voice with mute, deafen, push-to-talk (any key, or hold the mic button), and speaking indicators that match what everyone hears.
- Everyone's state is visible to everyone: muted, deafened, muted or deafened by the owner, and who is sharing their screen.
- Click someone for their profile; right-click for per-person volume and "mute for me". The owner can mute or deafen anyone for everyone.
- Text chat in the side panel, with an unread badge.

**Any screen**
- Responsive on phone, tablet, laptop and desktop (including landscape phones).
- Installable as a PWA.
- TV mode: open the TV view on a TV browser (enter the code it shows in your room) or cast a browser tab. It shows only the video, with no controls.

## Layout

```
apps/web         Next.js app (UI, Discord login via Auth.js, thin API routes)
apps/server      Fastify + ws (rooms in memory, LiveKit tokens, sync WebSocket)
packages/shared  zod schemas, types and the sync maths shared by both
```

## Requirements

Node 22.18+ (the server runs TypeScript directly), pnpm 10+, and Docker only if you self-host LiveKit locally.

## Setup

1. `pnpm install`
2. `cp .env.example .env` and fill it in (below).
3. `pnpm dev`, then open http://localhost:3000.

`pnpm dev` starts the web app (port 3000) and the server (port 4000). For local voice, run `pnpm livekit` in another terminal (needs Docker), or use LiveKit Cloud instead.

### Discord credentials

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Under **OAuth2**, copy the Client ID into `DISCORD_CLIENT_ID` and reset/copy the Client Secret into `DISCORD_CLIENT_SECRET`.
3. Add the redirect URL `http://localhost:3000/api/auth/callback/discord` (add your production URL the same way).
4. Generate `AUTH_SECRET` with `openssl rand -base64 32`.

### LiveKit credentials

- **Local (default in `.env.example`)**: `pnpm livekit` runs LiveKit in dev mode with key `devkey` and secret `secret`, at `ws://localhost:7880`.
- **LiveKit Cloud**: create a project at [cloud.livekit.io](https://cloud.livekit.io), then copy the WebSocket URL (`wss://….livekit.cloud`) into `LIVEKIT_URL` and an API key/secret pair from **Settings → Keys** into `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.

## Env vars

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | web | Discord OAuth |
| `AUTH_SECRET` | web, server | Session encryption and server token signing (must match) |
| `AUTH_URL` | web | Public URL of the web app |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | server | LiveKit connection and token minting |
| `NEXT_PUBLIC_SERVER_WS_URL` | web | WebSocket URL of the server (`wss://<server>/ws`); the HTTP URL is derived from it |
| `SERVER_WS_URL` | web | Optional runtime override of the above. Next bakes `NEXT_PUBLIC_*` values in at build time, this one is read when the app runs |
| `PORT` | server | Server port (default 4000) |

## How it works

- The browser never sends your Discord session to the server. Next API routes sign a short-lived HMAC token (with `AUTH_SECRET`) and call the Fastify server, which verifies it. Joining a room returns a LiveKit token plus a room-scoped ticket for the sync WebSocket.
- Voice, speaking indicators, screen share and chat run through LiveKit. Playback state, the stream list, roles, guest approvals and moderation run over the server's WebSocket, and every message is validated with zod (`packages/shared/src/protocol.ts`).
- Each stream stores `position`, `playing` and a server timestamp. Clients estimate the server clock (median of ping samples) and compute the expected position locally. Drift is the median of the last few readings, small drift is fixed by gently changing playback speed, and seeks are rare and debounced. Add `?debug` to a room URL to see the live numbers.
- Permissions are enforced on the server and in the LiveKit token, not just hidden in the UI: guests can't add streams, share, or create rooms; only the owner can mute, deafen, remove people, let guests in or change room settings; sharing can be limited to controllers.
- Twitch embeds must not be covered by anything on the page (Twitch disables playback if they are), so nothing is ever drawn over a Twitch player: its own controls are used and our status lines sit below it.
- YouTube titles are fetched server-side from YouTube's public oEmbed endpoint (no key needed).
- Rooms live in server memory and vanish on restart. Redis is the natural next step for persistence and running more than one server instance.

## Tests

```
pnpm --filter @nexus/shared test   # URL parsing, drift maths, live-edge helpers, tokens
pnpm --filter @nexus/server test   # spawns the server; permissions, guest approval, removal, moderation,
                                   # late joiners, passwords, tickets, TV pairing over real WebSockets
pnpm typecheck
```

## Deploy on Railway

Two services built from the Dockerfiles in `apps/server` and `apps/web` (the build context is the repo root, so the shared package is included). LiveKit must be [LiveKit Cloud](https://cloud.livekit.io), since Railway doesn't support UDP.

```
railway login
railway link --project <your project>
railway add --service server --variables RAILWAY_DOCKERFILE_PATH=apps/server/Dockerfile
railway add --service web    --variables RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
railway domain --service server && railway domain --service web
```

Variables (set with `railway variables --service <name> --set KEY=VALUE`):

| Service | Variables |
| --- | --- |
| `server` | `AUTH_SECRET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| `web` | `AUTH_SECRET` (same value as the server), `AUTH_URL` (the web domain), `NEXT_PUBLIC_SERVER_WS_URL` (`wss://<server domain>/ws`), `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` |

Railway sets `PORT` itself. Add `https://<web domain>/api/auth/callback/discord` as a redirect in the Discord developer portal. Deploy with `railway up --service server --ci` and `railway up --service web --ci`, or connect the GitHub repo to each service in the Railway dashboard for deploys on push (set the Dockerfile path variable as above).

Every server deploy or restart ends all rooms, because they live in memory. Keep the server at a single instance.
