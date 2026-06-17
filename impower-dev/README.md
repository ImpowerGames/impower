# impower-dev

The web app at **impower.dev** — the Sparkdown screenplay/game editor. A
[Preact](https://preactjs.com/) single-page app served by a small
[Fastify](https://fastify.dev/) server, built with [Vite](https://vite.dev/).

> New here? Read [`docs/architecture.md`](./docs/architecture.md) for how the
> system fits together, then [`docs/adding-an-editor-feature.md`](./docs/adding-an-editor-feature.md)
> for the practical "where do I put things" guide.

## Quick start

This package lives in an npm-workspaces monorepo. Install once from the **repo
root** (not from here):

```sh
npm install            # at the monorepo root — sets up all workspaces
```

Then run two dev servers in separate terminals:

```sh
# Terminal 1 — the editor, on http://localhost:8080
cd impower-dev
npm run dev

# Terminal 2 — the game player that the preview <iframe> loads, on http://localhost:5173
cd sparkdown-player-app
npm run dev
```

Open <http://localhost:8080>. You only need the player (terminal 2) if you want
the **game preview** to render; editing works with just the editor. The two
origins are wired by `.env.development` in each package (editor → player at
`:5173`, player → editor at `:8080`), so no extra env vars are needed.

> Editing a **worker** (LSP, screenplay-PDF, OPFS) hot-reloads automatically —
> the dev server runs each worker's esbuild in `--watch` mode and reloads the
> page when one rebuilds. No restart needed.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR (`tsx ./build.ts --watch`). |
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
