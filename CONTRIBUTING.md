# Contributing

Thanks for wanting to help. This is a one-person project, so small, focused pull requests are easiest to review. For anything big, open an issue first so we can agree on the approach.

## Prerequisites

- Node 22.18 or newer (the server runs TypeScript directly).
- pnpm (the exact version is pinned in `packageManager` in `package.json`).
- Docker, only if you want to run LiveKit locally with `pnpm livekit`.

## Setup

1. `pnpm install`
2. `cp .env.example .env` and fill it in. The README explains the Discord and LiveKit values. `AUTH_SECRET` must be the same for the web app and the server.
3. `pnpm dev` starts the web app (port 3000) and the server (port 4000).
4. For voice, run `pnpm livekit` in another terminal and stop it when you are done.

You can sign in as a guest, so Discord keys are optional for local work. Use two browser windows in one room to test anything that involves more than one person.

## Checks

Run these before opening a pull request:

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The test suites can also be run one at a time: `pnpm --filter @nexus/shared test` and `pnpm --filter @nexus/server test`.

The browser suites live in `e2e/` and are not part of CI. They need the stack running on port 3000 and internet access:

```
cd e2e
npm install
npx playwright-core install webkit
node run.mjs                 # every suite
node run.mjs queue layouts   # suites whose file name contains one of these words
```

Some suites need LiveKit (`pnpm livekit`) and `ffmpeg`. See [`e2e/README.md`](e2e/README.md) for the environment variables and the optional suites.

## Code conventions

- TypeScript is strict. Node runs `.ts` files directly, so imports use the `.ts` extension and only erasable syntax is allowed (no enums, no parameter properties).
- Every WebSocket message is validated with the zod schemas in `packages/shared/src/protocol.ts`.
- Permissions are enforced on the server and in the LiveKit grant, never only in the UI.
- Match the surrounding code: few comments, small components, restrained Apple-style UI.
- Changes to UI behaviour need an e2e check that asserts geometry (rects, `elementFromPoint`) rather than relying on screenshots.
- `CLAUDE.md` holds the longer list of layout rules and gotchas (phone layout variants, portals, embeds that must not be covered). Read the relevant parts before touching the player, the layout or the TV view.

## Workflow

`main` is protected, including for the maintainer.

1. Create a branch from `main`.
2. Make your change and run the checks above.
3. Open a pull request. The `check` job must pass.
4. Pull requests are squash-merged.

Never commit `.env` files or anything else that holds secrets.

## Licence

Nexus Lounge is licensed under the AGPL-3.0-or-later. By contributing, you agree that your contribution is released under the same licence.

## Security

Do not report vulnerabilities in public issues. Follow [`SECURITY.md`](SECURITY.md).

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
