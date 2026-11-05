# The player bridge

The game player (`packages/spark-web-player`) runs inside a host: the web editor's iframe (`sparkdown-player-app`), the VS Code Game Preview webview (`vscode-sparkdown/webviews/game-webview`) or the standalone player page. Host and player talk through the editor protocol: JSON-RPC messages that the host relays across its frame boundary (`PreviewGame.tsx` for the web editor, `SparkdownPreviewGamePanelManager.ts` for VS Code). This document lists the messages that drive the player's bar and size, and what each host does with them.

## Composition

The player package exports three host-agnostic components: `PlayerBar`, `PlayerConsole` and `ProblemsList` (`packages/spark-web-player/src/index.ts`). Each renders from props and reports what the user does through callbacks; none reads the DOM of the player or the host.

`PlayerBar` renders a `PlayerBarState` that `reducePlayerBar` folds from `preview/didChangeGameState`, `game/executed` and `game/resized`. The `<spark-web-player toolbar>` element composes it with the state its controller publishes. A host enables the bar's transport with attributes on that element: `skip-buttons` adds Skip back and Skip forward, and `step-buttons` adds Pause or Resume, Step Into and Step Out while a game is playing. `fullscreen-button` adds the fullscreen toggle. The player app turns query parameters of the same names into those attributes, so the web editor asks for the transport in its iframe's address (`/?skip-buttons&step-buttons`). The standalone player and VS Code pass neither, and their bars show no transport.

`PlayerConsole` renders log entries (severity, title, message, path, line, time) with severity filters and Clear, Copy and Save. `ProblemsList` renders problems grouped by script. Both report a jump to `path:line` through `onJump`. Their colours are the `--swp-console-*` custom properties declared at zero specificity in `spark-web-player.css`; the player app maps them to the theme's semantic variables in `sparkdown-player-app/src/style.css`.

## Messages

| Method | Direction | Parameters and result |
| --- | --- | --- |
| `preview/didChangeGameState` | player → host | `GameState`: `mounted`, `programLoaded`, `programVersion`, `launchState`, `paused`, `stepping`, `run`, `position`, `completion` and `ending` |
| `game/resized` | player → host | `{width, height, aspectRatio, fit}` after every change to the game's rendered size |
| `game/resize` | host → player | `{height}` or `{aspectRatio}` → `{}` |
| `preview/skipBeat` | player → host | `{direction: -1 \| 1}` → `{moved}` |
| `game/pause`, `game/unpause`, `game/step` | host or bar → player | The debugger's requests; the bar's Pause, Resume, Step Into and Step Out run the same handlers |

### Game state

`paused` is true while the playing game is paused. `stepping` is true while a `game/step` request is being answered. `ending` is the ending the shown frame holds (`{kind: "fin" | "out" | "error", location, error?}`), on a held PLAY and on a preview of a line where the story ends, and null otherwise. The web editor keeps its store's paused flag equal to `paused` while a game runs.

### Size report

`game/resized` reports the game's rendered width and height in CSS pixels, `fit`, and `aspectRatio`. `fit` says what decided the size: `auto` (the game fills the pane above the bar), `ratio` (a requested aspect ratio) or `height` (a height the user dragged the bar to, or a `game/resize` height). `aspectRatio` is the requested ratio when `fit` is `ratio`, otherwise the common ratio the size matches (`16:9`, `9:16`, `4:3`, `3:4`, `21:9`, `1:1`) or null. The player sends it when it mounts, on every resize of the game or its pane, and on every drag step, and never sends the same report twice in a row. VS Code keeps `height` as the panel's restored height when `fit` is `height` and forgets it when `fit` is `auto`.

### Fill request

`game/resize` with `{aspectRatio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16"}` makes the game the largest box of that ratio that fits the pane above the bar, centred across the pane, and keeps it fitted as the pane resizes. `{aspectRatio: "auto"}` returns the game to filling the pane. `{height}` sets a fixed height. Dragging the bar replaces any of them.

### Skip by beat

`preview/skipBeat` asks the host to move the preview one story beat back (`-1`) or forward (`1`). The web editor answers it as it answers PageUp and PageDown: it asks the language server for `sparkdown/offsetSourceLocation` from the caret's line and moves the caret there, which moves the preview. `moved` is false when there is no open script, no beat in that direction, the beat is in another script, or a previous skip is still moving. The bar sends one request per press and repeats it while the button is held: 400 ms after the press, then every 100 ms, with the click that ends the hold ignored. VS Code does not enable the skip buttons and does not answer the request.
