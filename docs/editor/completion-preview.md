# Autocomplete suggestion previews

This document specifies how the Game Preview shows an autocomplete suggestion before the author accepts it: what the editor reports, how the player compiles and shows a hypothetical program without letting it touch the real one, and what it costs. The author-facing description is [Previewing Suggestions](../../packages/sparkdown/docs/guide/SuggestionPreview.md). The feature is tracked by #633; the web editor is #634 and VS Code is #635.

## Design of record

Treat every highlighted completion as a request to preview its accepted text in a private document overlay. The normal stopped-preview pipeline decides the resulting scene. The editor sends no classification of whether the choice is visual. Closing requests the latest real document, and acceptance transfers ownership to the real accepted edit.

Each request is owned by what it would compile: the real document and version it applies to, the edit, the line shown and the project's file revision. Keep one active speculative evaluation and one replaceable pending request. Invalidate obsolete work before it can publish a program, route, assets or status. Restoration is not queued behind obsolete speculative work. Reuse workers, Game/Application instances, compiler state and bounded asset caches; never create these per candidate.

Canonical documents, diagnostics, route preferences, checkpoints and Play/export state are distinct from speculative state. Failed or incomplete candidates retain the last valid frame with a small status message. This retained frame may be speculative; it is a view only and cannot become canonical state. Successful actual or hypothetical results clear the status. Closing with an invalid actual document keeps the frame marked stale.

Only an already-open stopped preview participates. Native CodeMirror state provides the web lifecycle; VS Code uses the public inline-completion bridge described under [VS Code](#vs-code). Keep thumbnails. Consider a fallback only after demonstrating a missing native requirement and settling its interface.

## Protocol

The editor sends `textDocument/previewCompletion` (`packages/spark-editor-protocol/src/protocols/textDocument/PreviewCompletionMessage.ts`) for every newly highlighted option and for every close. A `focus` carries the real document's URI and version, the changes accepting the option would make against that version, and the cursor. `contentChanges: null` means the editor could not work out the edit; the player shows the unavailable state rather than guessing. A `close` carries, when an option was accepted, the version and changes of the accepting edit. Requests are numbered page-wide, so a replaced editor continues the count.

The web host forwards it to the player like every other `textDocument/` notification (`PreviewGame.tsx`).

## Editor

`completionPreview` (`packages/codemirror-vscode-lsp-client/src/completion.ts`) observes CodeMirror's completion state after every view update. It reports the first highlighted option, every change of highlight (including a return to an earlier option), and a highlighted option whose document changed underneath it; it reports a close when the completion state goes inactive, with the accepting transaction when there was one, and when the view is destroyed while a list is open. While a list waits for fresh results nothing is highlighted and nothing is reported.

`completionChanges` computes the edit by running the option's own edit against a stand-in view, so the result is the edit acceptance makes, including snippet placeholders, every cursor of a multiple selection and the text after the cursor. It never creates a transaction, dispatched or not: creating one runs the state's transaction extenders, and the web editor's extender announces every document change as an edit and a save. Only options built by the language-server source are known; any other returns null. Commands attached to a completion (such as re-triggering suggestions) belong to acceptance and never run while browsing.

## VS Code

VS Code has no public event for its suggestion list, but it tells inline completion providers which suggestion is highlighted (`InlineCompletionContext.selectedCompletionInfo`) while its inline completion model is active. `activateCompletionPreview` (`vscode-sparkdown/src/utils/activateCompletionPreview.ts`) registers a provider for Sparkdown documents that never returns an inline item and reports every call to `CompletionPreviewTracker` (`vscode-sparkdown/src/completion/CompletionPreviewTracker.ts`). When the language server answers a completion request with items while a connected, stopped Game Preview exists, the client middleware records the items and runs the public `editor.action.inlineSuggest.trigger`, which activates the model for the list about to open whether or not `editor.inlineSuggest.enabled` is on; no setting is read or written. Without the trigger a provider receives nothing while inline suggestions are disabled, and misses Escape while they are enabled.

The tracker reports a `focus` for a highlight it has not reported at the current document version, and a `close` when a call arrives with nothing highlighted, when the document with the open list stops being the active editor or is closed, and on a mouse selection change. A document change that is exactly the highlighted edit at the next version is acceptance: the `close` carries it as `accepted`. Any other change is an edit made while browsing; the list stays open and the next highlight is reported against the new version. Change events without changes (saves, the dirty marker) are ignored. While a list is open the trigger runs again every 500 ms: VS Code stops asking providers when the editor loses focus, and has no public event for that, but the trigger reaches the editor anyway and gets an answer with nothing highlighted. While the list stays open VS Code answers from its cache and the tracker sends nothing.

`selectedCompletionInfo` gives the replaced range and the plain text of the primary edit (snippets already expanded, indentation adjusted), and VS Code reports suggestions with equal primary edits identically. `completionChanges` (`vscode-sparkdown/src/completion/completionEdits.ts`) matches the report against the language server's items: by the start of the replaced range when an item has one, and by inserted text, expanding snippets and ignoring indentation. When the matching items agree on their secondary edits the edit is the primary edit plus those; when none match (a suggestion from another extension) or matching items disagree, `contentChanges` is null and the player shows the unavailable state. An item whose resolution adds secondary edits replaces the offered one and the highlight is reported again. Accepting inserts the suggestion at every cursor, so `otherCursorChanges` adds each other cursor's edit by VS Code's own rule (`SnippetSession.createEditsAndSnippetsFromSelections`): a cursor replaces as many characters before and after itself as the primary does, on each side only where they are the same text, and a multi-line insertion is re-indented to its line; when that cannot be worked out the edit is unknown.

The Game Preview panel announces every open Sparkdown document to the player with `textDocument/didOpen` and `textDocument/didClose`, as the web editor does, so the player's workspace takes an open script's text from the editor and does not treat its saves as outside changes to project files, which would move the file revision and compile the wanted suggestion again. Only documents in a workspace folder are announced, not views of a script under another scheme such as a diff. Each time the panel's player is initialized, which includes a webview reload, the tracker sends the open list's highlight again, since VS Code does not report a highlight that has not changed.

The extension requires VS Code 1.100. Earlier versions answer a request with nothing highlighted from their cache when one was already answered at the same cursor and document version, so a second Escape at the same place never reaches the provider. Other inline completion providers are asked whenever the trigger runs, so their ghost text can appear beside the highlighted suggestion even with inline suggestions disabled; acceptance with Enter inserts only the suggestion.

## Compiler

`SparkdownCompiler.previewCompile` applies the edit to the document registry's copy of the script under a negative version, compiles the root through the ordinary incremental pipeline, and applies the inverse changes before returning (`invertContentChanges`). No other request can observe the edited text, because the worker handles one message at a time. Both edits reparse incrementally, so a preview compile costs what an edit costs, and no second compiler or second copy of the project exists.

The compile listeners are not told about a preview compile; `compiler/didPreviewCompile` listeners are. `_canonical` records the last real compile, and `isProgramOutdated` answers from it throughout. A preview compile takes over unchanged flows of the runtime story the last real compile left, so `selectDocument` recompiles the real documents first when a preview compile has run since the last real compile and the real documents have not changed; if they have changed, the selection is outdated and the compile their edit scheduled restores the story.

## Player worker

The `compiler/didPreviewCompile` listener (`workspace.worker.ts`) hands the hypothetical program to the checkpoint-builder game and replays the route to the requested line with `searchRouteTo`, using its own route log and `remember: false`. The route's choices are never written to the compiler's `simulationOptions`, and nothing is recorded in the log PLAY reuses.

## Player controller

`GamePlayerController` owns scheduling and the screen:

- A suggestion is identified by `completionKey`: document, version, line, file revision and edit. The newest focus sets the wanted key. At most one suggestion compiles at a time; a newer focus replaces the waiting one. A result is shown only if its key is still wanted and the preview is still eligible; a file change during the compile compiles it again.
- A suggestion's draw is abandoned as soon as its key stops being wanted. `_completionShown` is the last suggestion drawn completely, with the program, checkpoint and simulation verdict it was drawn from. A return to it reuses the frame only while the game still holds its program; otherwise it is drawn again from that result without compiling. When the wanted suggestion cannot be shown (no edit, or a failed compile) after a draw was abandoned part way, the last complete frame is drawn again: the shown suggestion, or the real program when none was shown.
- The workspace moves `filesRevision` as a project file change begins and records the change until it has reached the compiler; `previewCompile` waits for recorded changes before sending. A real program that arrives while a list is open compiles the wanted suggestion again when the file revision moved since it was keyed.
- A user selection in another document than the open list's ends the suggestion preview.
- A suggestion's program gets a negative version that no real program has, and is remembered in a set, so the game swaps programs and the controller can tell when the game holds one. While it does, `game/executed` and `game/previewed` are not forwarded to the editor, which records their lines and route choices as the author's.
- `_program`, `_checkpoint` and the rest always describe the real document. While a list is open, real programs that arrive are recorded but not shown. Closing shows the newest real program at once from what the controller holds. When the real document does not compile, closing marks the frame `stale` and keeps the last complete frame, whether or not a suggestion was shown. After an accepted option whose frame is on screen, the frame stays until a program compiled from the accepted version arrives.
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
