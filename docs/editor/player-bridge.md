# The player bridge

The game player (`packages/spark-web-player`) runs inside a host: the web editor's iframe (`sparkdown-player-app`), the VS Code Game Preview webview (`vscode-sparkdown/webviews/game-webview`) or the standalone player page. Host and player talk through the editor protocol: JSON-RPC messages that the host relays across its frame boundary (`PreviewGame.tsx` for the web editor, `SparkdownPreviewGamePanelManager.ts` for VS Code). This document lists the messages that drive the player's bar and size, and what each host does with them.

## Composition

The player package exports two host-agnostic components: `PlayerBar` and `PlayerConsole` (`packages/spark-web-player/src/index.ts`). Each renders from props and reports what the user does through callbacks; none reads the DOM of the player or the host.

`PlayerBar` renders a `PlayerBarState` that `reducePlayerBar` folds from `preview/didChangeGameState`, `game/executed` and `game/resized`. The `<spark-web-player toolbar>` element composes it with the state its controller publishes. A host enables the bar's transport with attributes on that element: `skip-buttons` adds Skip back and Skip forward, and `step-buttons` adds Pause or Resume, Step Into and Step Out while a game is playing. `fullscreen-button` adds the fullscreen toggle. `host-display` hands the game's shape to the host: the bar drops its resize handle, its ratio and size readout and the fullscreen toggle, and dragging the bar no longer resizes the game, so the host sets the ratio with `game/resize` and reads `game/resized`. The player app turns query parameters of the same names into those attributes. The web editor draws the transport in its own preview top bar and its display controls in the bar under the game, so it asks only for `host-display` in its iframe's address (`/?host-display`). The standalone player and VS Code pass none of these, and their bars show no transport.

`PlayerConsole` renders log entries (severity, title, message, path, line, time) with severity filters and Clear, Copy and Save, and reports a jump to `path:line` through `onJump`. Its entry model and text format (`consoleEntries.ts`: `[time] SEVERITY · title`, the message, then `path:line`, one blank line between entries) are also what the web editor's Problems panel lists under While playing and copies or saves. Their colours are the `--swp-console-*` custom properties declared at zero specificity in `spark-web-player.css`; the player app maps them to the theme's semantic variables in `sparkdown-player-app/src/style.css`.

## Messages

| Method | Direction | Parameters and result |
| --- | --- | --- |
| `preview/didChangeGameState` | player → host | `GameState`: `mounted`, `programLoaded`, `programVersion`, `launchState`, `paused`, `stepping`, `run`, `position`, `completion` and `ending` |
| `game/resized` | player → host | `{width, height, aspectRatio, fit}` after every change to the game's rendered size |
| `game/resize` | host → player | `{height}` or `{aspectRatio}` → `{}` |
| `preview/skipBeat` | player → host | `{direction: -1 \| 1}` → `{moved}` |
| `game/runtimeError` | player → host | The game's `{message, type, location, state}` for each runtime error, warning or note it raises outside a scrubbed preview; the web editor logs those with `state: "running"` under the Problems panel's While playing and opens the panel on an error |
| `game/toggledConsole` | player → host | `{open}`: the player forwards it when the game sends it, and the web editor opens or collapses its Problems panel. The engine does not send it; the script functions that will (`debug.console.open()` and `debug.console.close()`) belong to ImpowerGames/impower-internal#549 |
| `game/pause`, `game/unpause`, `game/step` | host or bar → player | The debugger's requests; the bar's Pause, Resume, Step Into and Step Out run the same handlers |
| `game/rollBack`, `game/rollForward` | host → player | `{to: "beat" \| "choice" \| "breakpoint", hold?}` → the engine's roll result (`moved`, then `restored` and `history`, or `reason` and `history`, or `superseded`) with the `run` it answered for and `held`, true when `hold` was asked, the roll moved and the run was held before it, so it stays paused |
| `game/rolled` | player → host | `{restored, history, run}` once a rolled beat is drawn |

### Game state

`paused` is true while the playing game is paused. `stepping` is true while a `game/step` request is being answered. `ending` is the ending the shown frame holds (`{kind: "fin" | "out" | "error", location, error?}`), on a held PLAY and on a preview of a line where the story ends, and null otherwise. The web editor keeps its store's paused flag equal to `paused` while a game runs.

### Size report

`game/resized` reports the game's rendered width and height in CSS pixels, `fit`, and `aspectRatio`. `fit` says what decided the size: `auto` (the game fills the pane above the bar), `ratio` (a requested aspect ratio) or `height` (a height the user dragged the bar to, or a `game/resize` height). `aspectRatio` is the common ratio the rendered size matches (`16:9`, `9:16`, `4:3`, `3:4`, `21:9`, `1:1`), or null when it matches none. The player sends it when it mounts, on every resize of the game or its pane, and on every drag step, and never sends the same report twice in a row. VS Code keeps `height` as the panel's restored height when `fit` is `height` and forgets it when `fit` is `auto`.

### Fill request

`game/resize` with `{aspectRatio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16"}` makes the game the largest box of that ratio that fits the pane above the bar, centred across the pane, and keeps it fitted as the pane resizes. `{aspectRatio: "auto"}` returns the game to filling the pane. `{height}` sets a fixed height. Dragging the bar replaces any of them. Fullscreen fills the screen whatever the fit, and the report then gives the full size.

### Skip by beat

`preview/skipBeat` asks the host to move the preview one story beat back (`-1`) or forward (`1`). The web editor answers it as it answers PageUp and PageDown. The bar sends one request per press and repeats it while the button is held: 400 ms after the press, then every 100 ms, with the click that ends the hold ignored. VS Code does not enable the skip buttons and does not answer the request.

When no story is playing, the web editor asks the language server for `sparkdown/offsetSourceLocation` from the caret's line and moves the caret there, which moves the preview. `moved` is false when there is no open script, no beat in that direction, the beat is in another script, or a previous skip is still moving.

While a story is playing, Skip rolls the run instead: the web editor sends the debug adapter `sparkdown/rollBack` or `sparkdown/rollForward` with `{to: "beat"}`, or `{to: "choice"}` for Shift+click, Shift+PageUp and Shift+PageDown, and the adapter sends the player `game/rollBack` or `game/rollForward`. The engine restores the beat's checkpoint and draws it settled: its text revealed, its transitions ended and its one-shot sounds silent, with each looping channel set to what the beat held (a track it already plays continues, another starts from its beginning, one it does not hold stops). A tap, or the recorded option at a restored choice menu, rolls forward; another option forks the run. The engine's history (`canRollBack`, `canRollForward`, `behindLatest` and their reasons, on `game/executed`, `game/stepped` and `game/rolled`) is what the bar reads: Skip back is disabled at the run's first beat with "Nothing to go back to.", Skip forward at its latest beat with "No later played beat. Continue the story to play more.", and the steps while behind the latest beat with "Make the choice, or skip to the latest beat, to step on.". The editor's caret follows each restored beat. When the debugger holds the run (paused, stopped at a breakpoint or a step, or at the story's end), as it does whenever VS Code offers Step Back or Reverse Continue, a roll keeps it held: the adapter asks for the roll with `hold`, the player pauses the run at the restored beat in the same step and answers `held`, and the adapter then sends a `stopped` event with reason `step`; a roll from the end leaves the ended state. A roll of a playing run neither pauses nor stops it. Reverse Continue rolls back to the latest earlier beat a breakpoint held the run on, else the run's first beat.
