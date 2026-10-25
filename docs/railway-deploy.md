# Deploying to Railway

Project `nexus-lounge`, environment `production`, two services built from the repo root (build context = repo root, because the Dockerfiles copy `packages/shared`).

| Service | Dockerfile | Health check | Public URL |
|---|---|---|---|
| `server` (Fastify + ws) | `apps/server/Dockerfile` | `GET /health` | https://server-production-e92a.up.railway.app |
| `web` (Next.js) | `apps/web/Dockerfile` | `GET /login` | https://web-production-795645.up.railway.app |

Each service selects its Dockerfile through the service variable `RAILWAY_DOCKERFILE_PATH`.

## Auto-deploy

Both services are connected to GitHub repo `dsameendra/nexus-lounge`, branch `main`, root directory empty (repo root). Railway's GitHub app creates a deployment trigger per service, so every push to `main` builds and deploys, but only when a changed file matches that service's watch patterns:

- server: `/apps/server/**`, `/packages/shared/**`, `/package.json`, `/pnpm-lock.yaml`, `/pnpm-workspace.yaml`, `/tsconfig.base.json`
- web: `/apps/web/**`, plus the same shared and root entries

A change to `packages/shared` or the root lockfile therefore builds BOTH services. Changes only under `docs/` or the other app build nothing. The trigger does not wait for CI (`checkSuites` is false).

## Settings and why config-as-code is not active

`docs/railway/server.railway.json` and `docs/railway/web.railway.json` describe the intended settings (they live in `docs/` on purpose, so nobody mistakes them for live config) (builder DOCKERFILE, `dockerfilePath`, `watchPatterns`, `healthcheckPath`, `healthcheckTimeout` 60 s, `restartPolicyType` ON_FAILURE, `restartPolicyMaxRetries` 5, and `numReplicas` 1 for the server). Keys are from https://docs.railway.com/reference/config-as-code.

IMPORTANT: they are reference copies and are NOT read by Railway. Railway only auto-reads `railway.json` at the root directory, and setting a custom config path (`railwayConfigFile`) is rejected by the API ("Config as Code is deprecated"). The same values were therefore applied directly to the service settings (dashboard: service > Settings; API: `serviceInstanceUpdate`). Treat the dashboard values as the source of truth and keep the JSON files in sync by hand, or migrate to Railway Infrastructure as Code (`railway config migrate`).

Applied service settings (verified via API): watch patterns as above; healthcheck `/health` (server) and `/login` (web), timeout 60 s; restart ON_FAILURE, max 5 retries; server `numReplicas` 1. The API exposes no `DOCKERFILE` builder value, the dashboard shows RAILPACK, but the Dockerfile is used because `RAILWAY_DOCKERFILE_PATH` is set ("Railway will always build with a Dockerfile if it finds one").

## Required variables (names only)

- server: `AUTH_SECRET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `RAILWAY_DOCKERFILE_PATH`
- web: `AUTH_SECRET`, `AUTH_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `NEXT_PUBLIC_SERVER_WS_URL`, `RAILWAY_DOCKERFILE_PATH`

`NEXT_PUBLIC_*` values are inlined at build time. Secrets live only in Railway variables and git-ignored files (`.env*`, excluded by `.gitignore` and `.dockerignore`).

## Single replica

The server keeps all rooms in memory, so it must run exactly one replica (`numReplicas` 1; never scale or add regions). Every redeploy or restart ends active rooms, which is accepted. Because of that, pushes to `main` that touch server code or shared code interrupt live rooms.

## Manual deploy

```
railway up --service server --ci
railway up --service web --ci
```

Run from the repo root. This uploads the local working tree, including uncommitted changes.

## Roll back

Dashboard: service > Deployments > pick an earlier successful deployment > Rollback (or `railway deployment list --service <name>` and `railway deployment redeploy`, which redeploys the latest). Rollback of a server deployment also ends rooms. Note a later push to `main` will deploy forward again; revert the commit to make it stick.

## User-only steps

None known to remain: the Railway GitHub app already had access to the private repo and both connections succeeded. To confirm end to end, push a small change under `apps/web/` and watch the `web` deployment appear with the commit as its source. If it does not, check the repo is enabled for the Railway GitHub app at https://github.com/settings/installations.

## Admin overview (optional)

`/admin` shows live rooms and people to the operator. It stays off unless all of these are set; the server then does not register the route at all.

| Variable | Services | Value |
| --- | --- | --- |
| `ADMIN_SECRET` | web and server (same value) | 32+ random characters (`openssl rand -base64 48`), different from `AUTH_SECRET` |
| `ADMIN_DISCORD_IDS` | web and server (same value) | Your Discord user ID (Discord: Settings, Advanced, Developer Mode, then right-click your name, Copy User ID). Comma-separate several |
| `ADMIN_TOTP_SECRET` | web only | Base32 key (`openssl rand 20 \| base32`) |

Enrol the TOTP key in an authenticator app (manual entry, time-based, SHA-1, 6 digits, 30 seconds). Mark the secrets as sealed variables in Railway. To rotate `ADMIN_SECRET`, change it on both services in the same deploy; to revoke an admin, remove their ID from both lists.

## Client IP behind Railway

Railway puts two proxies in front of the server and overwrites any client-supplied `X-Forwarded-For`, so the server trusts exactly two hops (`TRUST_PROXY_HOPS`, default 2). Probe it after changes: send a spoofed `X-Forwarded-For` and confirm the logged `remoteAddress` is your real IP.
