# Security Policy

## Reporting a vulnerability

Please report security problems privately, not in public issues.

Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it, and the impact you expect. You'll get an acknowledgement within a few days, and I'll keep you updated until it's fixed. Please give me a reasonable time to fix an issue before sharing it publicly.

## Scope

In scope: the web app, the realtime server (WebSocket and HTTP API), room access control, sign-in and sessions, the TV pairing flow, and the deployment configuration in this repository.

Out of scope: third-party services (Discord, YouTube, Twitch, LiveKit, Railway), denial-of-service by sheer volume, and social engineering.

## Supported versions

Only the latest commit on `main`, which is what is deployed.

## For self-hosters

- Never commit `.env` files. `AUTH_SECRET` must be a long random value (for example `openssl rand -base64 32`) and must match between the web app and the server.
- Replace the `devkey` / `secret` LiveKit credentials from `.env.example` with real ones before exposing an instance.
- Keep a single server instance: rooms live in memory.
