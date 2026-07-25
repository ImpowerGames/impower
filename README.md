# Impower

Monorepo for **Sparkdown** — a markup language for writing screenplays and
games — and the tools around it: the [impower.dev](./impower-dev) web editor, the
[VS Code extension](./vscode-sparkdown), the language server, the game engine,
and the player.

## Recommended Workspace Setup

1. Install IDE: [Visual Studio Code](https://code.visualstudio.com/)
2. In VSCode, install all [Workspace Recommended Extensions](https://code.visualstudio.com/docs/editor/extension-marketplace#_workspace-recommended-extensions).

## Local development

This is an npm-workspaces monorepo. **Install once from the repo root**, then use
the root launch scripts below — they are the supported way to run things and they
keep the multi-process wiring correct.

```sh
npm install        # once, at the repo root — sets up every workspace
```

| To work on… | Run (from the repo root) | What it does |
| --- | --- | --- |
| The **web editor** ([impower-dev](./impower-dev)) | `npm run web:dev` | Launches the editor **and** the game-preview player together, on auto-picked free ports, and prints the editor URL. `Ctrl+C` stops both. |
| …forcing a separate-origin player iframe | `npm run web:dev:cross-origin` | Same, but cross-origin instead of the default same-origin proxy. (`web:dev:same-origin` is the explicit default.) |
| The **VS Code extension** ([vscode-sparkdown](./vscode-sparkdown)) | `npm run vscode:dev` | Builds + watches the extension and everything it bundles; press **F5** in VS Code to open an Extension Development Host. |

Override the web ports with the `EDITOR_PORT` / `PLAYER_PORT` / `HMR_PORT` env
vars if you need fixed ports.

### Why `web:dev` instead of launching the two servers yourself

The editor embeds the game player as an `<iframe>` and the two connect over a
postMessage/MessageChannel handshake. That handshake needs three things to agree:
the editor's player-origin, the player's editor-origin, and a unique HMR port per
editor. Get any of them wrong — or collide with another running checkout — and the
**Game Preview silently stays black** even on PLAY (the editor never finishes
connecting; the editor pane itself looks fine). The values are baked into each
Vite bundle at startup, so a page reload won't fix a wrong one. `web:dev` removes
the footgun entirely: it derives every value consistently and never collides
(every port is chosen free at launch). Just run it and open the URL it prints.

Same-origin mode (the default) additionally exposes `window.__preview` in the
editor page so you can inspect the live game DOM from the console / devtools.
