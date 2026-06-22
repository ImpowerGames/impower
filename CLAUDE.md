# Working in this repo

## Running the live editor / game preview

To see a change in the running editor or game preview, launch BOTH dev servers
with one command from the repo root:

```sh
npm run web:dev                # same-origin (default)
npm run web:dev:cross-origin   # separate-origin iframe
```

It auto-picks free ports (never colliding with another worktree's servers),
wires every cross-referencing env var consistently, waits for readiness, and
prints the editor URL. `Ctrl+C` stops both. Override ports with `EDITOR_PORT` /
`PLAYER_PORT` / `HMR_PORT` if needed. Same-origin mode (the default) lets you
inspect the live game DOM from the editor page via `window.__preview`.

**Do NOT hand-launch the editor (`impower-dev`) and player (`sparkdown-player-app`)
separately** unless you fully understand the handshake below — it's a footgun.

### Failure signature & why it happens

The editor embeds the player as an `<iframe>` and they connect over a
postMessage + MessageChannel handshake. The wiring that must agree:

- Editor needs `VITE_SPARKDOWN_PLAYER_ORIGIN` = the player's real origin (it's
  the iframe `src`), plus a unique `HMR_PORT` (the default collides when another
  editor is already running → its Vite HMR websocket fails → the page reloads in
  a loop).
- Player needs `VITE_SPARKDOWN_EDITOR_ORIGIN` = the editor's origin so its
  handshake replies `postMessage` to the right place. (On `localhost` the player
  now relaxes this — it learns the editor's origin from the first message — but
  prod stays strict.)

These are **build-time** Vite vars baked into each bundle, so a page reload
won't fix a wrong value — you must restart the server. Get any of them wrong and
the **Game Preview is fully black, even on PLAY** (the editor never completes
`connect`/`Initialize`, so the game never runs); the editor pane itself looks
fine. `npm run dev:preview` exists precisely so you never have to get this right
by hand.

OPFS project storage is **per-origin**, so a project saved at one editor port is
invisible at another — use the URL the launcher prints.
