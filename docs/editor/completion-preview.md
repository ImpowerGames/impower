# Autocomplete suggestion previews

This document specifies how the Game Preview shows an autocomplete suggestion before the author accepts it: what the editor reports, how the player compiles and shows a hypothetical program without letting it touch the real one, and what it costs. The author-facing description is [Previewing Suggestions](../../packages/sparkdown/docs/guide/SuggestionPreview.md). The feature is tracked by #633; the web editor is #634 and VS Code is #635.

## Design of record

Treat every highlighted completion as a request to preview its accepted text in a private document overlay. The normal stopped-preview pipeline decides the resulting scene. The editor sends no classification of whether the choice is visual. Closing requests the latest real document, and acceptance transfers ownership to the real accepted edit.

Each request is owned by what it would compile: the real document and version it applies to, the edit, the line shown and the project's file revision. Keep one active speculative evaluation and one replaceable pending request. Invalidate obsolete work before it can publish a program, route, assets or status. Restoration is not queued behind obsolete speculative work. Reuse workers, Game/Application instances, compiler state and bounded asset caches; never create these per candidate.

Canonical documents, diagnostics, route preferences, checkpoints and Play/export state are distinct from speculative state. Failed or incomplete candidates retain the last valid frame with a small status message. This retained frame may be speculative; it is a view only and cannot become canonical state. Successful actual or hypothetical results clear the status. Closing with an invalid actual document keeps the frame marked stale.

Only an already-open stopped preview participates. Native CodeMirror state provides the web lifecycle; VS Code uses the public-trigger/inline-context bridge described in #635. Keep thumbnails. Consider a fallback only after demonstrating a missing native requirement and settling its interface.

## Protocol

The editor sends `textDocument/previewCompletion` (`packages/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage.ts`) for every newly highlighted option and for every close. A `focus` carries the real document's URI and version, the changes accepting the option would make against that version, and the cursor. `contentChanges: null` means the editor could not work out the edit; the player shows the unavailable state rather than guessing. A `close` carries, when an option was accepted, the version and changes of the accepting edit. Requests are numbered page-wide, so a replaced editor continues the count.

The web host forwards it to the player like every other `textDocument/` notification (`PreviewGame.tsx`).

## Editor

`completionPreview` (`packages/codemirror-vscode-lsp-client/src/completion.ts`) observes CodeMirror's completion state after every view update. It reports the first highlighted option, every change of highlight (including a return to an earlier option), and a highlighted option whose document changed underneath it; it reports a close when the completion state goes inactive, with the accepting transaction when there was one. While a list waits for fresh results nothing is highlighted and nothing is reported.

`completionChanges` computes the edit by running the option's own edit against a stand-in view, so the result is the edit acceptance makes, including snippet placeholders, every cursor of a multiple selection and the text after the cursor. It never creates a transaction, dispatched or not: creating one runs the state's transaction extenders, and the web editor's extender announces every document change as an edit and a save. Only options built by the language-server source are known; any other returns null. Commands attached to a completion (such as re-triggering suggestions) belong to acceptance and never run while browsing.

## Compiler

`SparkdownCompiler.previewCompile` applies the edit to the document registry's copy of the script under a negative version, compiles the root through the ordinary incremental pipeline, and applies the inverse changes before returning (`invertContentChanges`). No other request can observe the edited text, because the worker handles one message at a time. Both edits reparse incrementally, so a preview compile costs what an edit costs, and no second compiler or second copy of the project exists.

The compile listeners are not told about a preview compile; `compiler/didPreviewCompile` listeners are. `_canonical` records the last real compile, and `isProgramOutdated` answers from it throughout. A preview compile takes over unchanged flows of the runtime story the last real compile left, so `selectDocument` recompiles the real documents first when a preview compile has run since the last real compile and the real documents have not changed; if they have changed, the selection is outdated and the compile their edit scheduled restores the story.

## Player worker

The `compiler/didPreviewCompile` listener (`workspace.worker.ts`) hands the hypothetical program to the checkpoint-builder game and replays the route to the requested line with `searchRouteTo`, using its own route log and `remember: false`. The route's choices are never written to the compiler's `simulationOptions`, and nothing is recorded in the log PLAY reuses.

## Player controller

`GamePlayerController` owns scheduling and the screen:

- A suggestion is identified by `completionKey`: document, version, line, file revision and edit. The newest focus sets the wanted key. At most one suggestion compiles at a time; a newer focus replaces the waiting one. A result is shown only if its key is still wanted and the preview is still eligible; a file change during the compile compiles it again.
- A suggestion's program gets a negative version that no real program has, and is remembered in a set, so the game swaps programs and the controller can tell when the game holds one. While it does, `game/executed` and `game/previewed` are not forwarded to the editor, which records their lines and route choices as the author's.
- `_program`, `_checkpoint` and the rest always describe the real document. While a list is open, real programs that arrive are recorded but not shown. Closing shows the newest real program at once from what the controller holds. After an accepted option whose frame is on screen, the frame stays until a program compiled from the accepted version arrives.
- PLAY ends every suggestion preview before it builds its game from `_program`. A hidden (zero-size) or running preview takes no part.
- The toolbar's `#completion-status` shows `preparing` (after 150 ms), `showing`, `unavailable` and `stale`. `preview/gameState` reports the same state as `completion`.

## Program transport

Every compile and every preview compile sends a program from the compiler worker to its workspace. `ProgramTransportEncoder` (worker) and `ProgramTransportDecoder` (workspace) share each attribute vocabulary's large parts across programs by number, sending a part again only when its file changes, and send path locations as one typed array. Programs are decoded in the order they are encoded; after each program both sides keep only the parts that program used. The asset channel shares vocabularies with the context instead of copying them (`cloneSharingVocabularies`).

## Performance

Measured on the Raffles & Bunny project (main script 8,254 lines, 646 files, 149 MB of assets), completing `[[bunny_a|]]` at line 299, on a desktop Windows 11 machine in headless Chromium driven by the editor driver. "Key press to painted result" is timed in the page, from the key event to the `preview/didChangeGameState` notification that reports the result on screen.

| | Accepted edit before this change | Highlighted suggestion |
| --- | --- | --- |
| Arrow key to painted result, warm | 1.75–1.87 s (Enter to painted) | 0.67–1.05 s |
| First suggestion after typing, including the language server's list | not applicable | 0.89–1.38 s |
| Compile in the worker | 450–510 ms | 230–420 ms |
| Route replay in the worker | about 250 ms | 120–210 ms |
| Program transfer to the page | about 500 ms | 66–123 ms |
| Redraw on the page | about 445 ms | about 200 ms |

The first column's per-phase figures come from a Node harness that drives the player worker's compiler and game on the same project and edit (the browser does not expose worker timings); its total is the browser measurement. An accepted edit also benefits from the compile, route and transfer changes and now repaints in 1.1–1.7 s.

Budget: a warm suggestion on this project paints within 1.2 s of the key press, and the first suggestion after typing within 1.5 s; a short script paints in a few hundred milliseconds. The largest remaining costs are the compiler's non-incremental runtime export and the route planner, both shared with ordinary edits.

Fifteen rounds of typing, ten rapid arrow keys and Escape (150 highlights) ran 32 compiles and drew 16 results; the rest were replaced before they started or dropped as stale. Nothing was pending afterwards, the preview page's heap was 342 MB before and after, and no worker, game or application is created for a suggestion: the worker's game and the page's game and application are the ones the ordinary preview uses.
