# Working in this repo

## Running the dev environment (editor + game preview)

The editor and the game preview are **two separate dev servers**, and the editor
embeds the player as a **cross-origin iframe** over `postMessage` RPC:

- **`impower-dev`** → the editor / IDE (`<spark-editor>`). Default port **8080**
  (honors `PORT`).
- **`sparkdown-player-app`** → the game preview (`<spark-web-player>`). Default
  port **5173** (Vite). This is the iframe the editor drives — opening it
  directly just shows a blank player waiting for a program.

**You open the EDITOR**, not the player. The player only renders a game once the
editor compiles a project and pushes it over the RPC bridge.

### Launch a matched pair

```bash
# 1. Player (pick a port PP):
cd sparkdown-player-app
npx vite --port <PP> --strictPort

# 2. Editor (pick a port EP); point it at the player's port:
cd impower-dev
PORT=<EP> VITE_SPARKDOWN_PLAYER_ORIGIN=http://localhost:<PP> npm run dev

# 3. Open the editor:
http://localhost:<EP>      # use this exact host (see below)
```

`VITE_SPARKDOWN_PLAYER_ORIGIN` **must** point at the player's actual port — it's
the iframe `src`. If it's wrong, the iframe loads nothing.

### The recurring "black preview" trap (origin mismatch)

The player accepts/sends RPC only to an **exact** origin
(`scheme://host:port`). If the player's `VITE_SPARKDOWN_EDITOR_ORIGIN` doesn't
exactly match the editor's real origin — e.g. `127.0.0.1` vs `localhost`, or a
stale/default editor port — the browser **silently drops** the handshake. Result:
**black preview, no error anywhere**. This is the #1 cause of "the preview won't
show up".

- As of the player dev-origin fix, the player **relaxes this on localhost**: when
  served from `localhost`/`127.0.0.1` it accepts the editor on any origin and
  posts back with `"*"`. So for local dev you mainly just need
  `VITE_SPARKDOWN_PLAYER_ORIGIN` → the correct player port. Prod stays strict.
- Still **use one host consistently** (prefer `localhost`): the editor's
  workspace storage (**OPFS**) is **per-origin**, so a project loaded under
  `localhost:<EP>` is invisible under `127.0.0.1:<EP>`.

### Multiple checkouts

Each clone/worktree (`impower`, `impower-main`, `impower.worktrees/*`) runs its
**own** pair from its **own** `packages/`, so give each distinct ports (e.g.
`8080/5173`, `8081/5174`, `8082/5175`). A server launched from one checkout does
**not** reflect another checkout's code — to test changes in a worktree, run the
servers **from that worktree** (and `npm install` its `sparkdown-player-app` if
needed). Confirm which checkout serves a port with the process command line, not
assumptions.

### Other gotchas

- **HMR port 24679 is hardcoded** (`impower-dev/build.ts`). Running a 2nd editor
  logs `Port 24679 is already in use` and floods the console with
  `WebSocket closed without opened` — HMR is off for that editor, but it still
  serves; just hard-reload after edits. Cosmetic.
- **Worker bundle staleness:** `sparkdown-player-app` builds its engine/compiler
  worker once and ignores dependency changes. After editing `packages/*` engine/
  compiler code, **fully restart** the player server — a reload / `--force` won't
  pick it up. (App-level files like `main.ts` and `UIManager` DO reload.)
- The `?raw` "Failed to scan for dependencies" errors in the editor startup log
  are benign on this setup; the server still comes up (`Server ready at ...`).
