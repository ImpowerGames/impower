# impower-dev

The web app at **impower.dev** — the Sparkdown screenplay/game editor. A
[Preact](https://preactjs.com/) single-page app served by a small
[Fastify](https://fastify.dev/) server, built with [Vite](https://vite.dev/).

> New here? Read [`docs/architecture.md`](./docs/architecture.md) for how the
> system fits together, then [`docs/adding-an-editor-feature.md`](./docs/adding-an-editor-feature.md)
> for the practical "where do I put things" guide.

## Quick start

This package lives in an npm-workspaces monorepo. Install once from the **repo
root**, then start everything with the root launcher (also from the root):

```sh
npm install        # at the monorepo root — sets up all workspaces
npm run web:dev    # at the monorepo root — starts BOTH servers, prints the URL
```

`web:dev` launches the editor **and** the game-preview player together, picks
free ports, wires the editor↔player handshake consistently, waits for both to be
ready, and prints the editor URL to open. `Ctrl+C` stops both. It defaults to
**same-origin** mode (the editor proxies the player under its own origin, so the
live game DOM is reachable from the editor page); use `npm run web:dev:cross-origin`
for a separate-origin iframe. See the [root README](../README.md).

> **Don't hand-launch the editor and player in two terminals** unless you fully
> understand the handshake. The editor embeds the player as an `<iframe>` and the
> two connect over a postMessage/MessageChannel handshake. If the
> cross-referencing origins/ports don't agree — or collide with another running
> checkout — the **Game Preview silently stays black** even on PLAY (the editor
> never finishes connecting). `web:dev` exists precisely so you never have to get
> this wiring right by hand.

> Editing a **worker** (LSP, screenplay-PDF, OPFS) hot-reloads automatically —
> the dev server runs each worker's esbuild in `--watch` mode and reloads the
> page when one rebuilds. No restart needed.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | The editor server alone (`tsx ./build.ts --watch`). The root `web:dev` launches this **plus** the player with consistent config — prefer that. |
| `npm run build` | Production build to `out/` (minified). |
| `npm start` | Serve a built `out/` (`node ./out/api/index.js`) — what the Docker image runs. |
| `npm test` | Run the vitest suite (`test/**/*.test.ts`). |
| `npm run kill` | Free port 8080 if a dev server is stuck. |

## Layout

```
src/
  api/        Fastify server: routes, plugins, Google Drive sync, static serving
  pages/      Client entry points (index.ts → the editor) + HTML shells
  modules/
    spark-editor/
      preact-registry.ts   The root Preact component the SSG + client both mount
      components/          The editor UI (Preact + Tailwind, shadcn-style)
      workspace/           Controllers + the reactive store (see architecture.md)
  workers/    Service worker
  build/      SSG helpers (staticallyRenderPage, populateDocument)
vite.config.ts   Vite config + custom plugins (see build-pipeline.md)
build.ts         The multi-target build orchestrator + dev server
test/            Vitest tests
docs/            This documentation
```

## Build & deploy

`build.ts` orchestrates a multi-target build (API bundle, page bundles, SSG'd
HTML, workers, service worker) — it is *not* a stock `vite build`, because the
SSG and the Fastify-mounted dev server don't fit Vite's single-config model.
See [`docs/build-pipeline.md`](./docs/build-pipeline.md). Production deploys to
Google Cloud Run via a multi-stage `Dockerfile` (built from the monorepo root)
and `impower-dev.cloudbuild.yaml`.
