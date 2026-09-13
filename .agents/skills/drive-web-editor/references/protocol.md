# Editor protocol in development

The development editor exposes `window.__editorProtocol.send(message, timeoutMs?)` and `subscribe(listener)` (returns an unsubscribe function). Send existing JSON-RPC requests with unique IDs; the promise resolves to their result or rejects with the protocol error. Notifications omit the ID. The bridge clones outgoing messages, so worker transfer does not detach the caller's buffers. The default request timeout is 30 seconds.

Useful reads:

| Method | Parameters and result |
| --- | --- |
| `window/loadedProjectId` | `{}` → actual loaded project `{id}` |
| `editor/read` | Optional `textDocument: {uri}` and zero-based UTF-16 `position` → document text/version, selection and coordinates at that position |
| `textDocument/diagnosticsSettled` | `textDocument: {uri}`, optional minimum `version` → fresh full diagnostics and version; also emits `textDocument/didSettleDiagnostics` |
| `textDocument/hover` | `textDocument: {uri}, position` → hover contents plus each image's source, load result and intrinsic dimensions |
| `preview/gameState` | `{}` → mounted/programLoaded, programVersion, launchState and selected source position |

Player state changes emit `preview/didChangeGameState`. The position identifies the source target whose preview update has completed, including asset waits and UI reconciliation. It is null while a user selection is pending or its file has been removed. Sticky previews can keep the same beat for different source targets. Launch states are preview, play, pause or null before a program loads. Subscribe before requesting a change to avoid missing a fast notification. Opening a script uses `window/didOpenFileEditor` with `{pane: "logic", panel: "scripts", filename}`; wait for the matching `editor/didLoad` URI before requesting its diagnostics.

The same bus handles workspace read/import/create/delete requests. The driver uses these handlers for content writes and imports; rendered screenshots, panel controls and completion presentation still use Playwright.

Subscriptions deliver editor notifications, including events caused by a command, but do not echo the exact notification injected by `send`. Imports send one archive to the editor protocol and at most eight per-file create/read operations concurrently. Archives larger than 4 MiB of base64 cross the browser automation channel in 4 MiB chunks, decoded into a browser-owned buffer so a supported 256 MiB file does not exceed the DevTools message limit. Explicit creates bypass the editing debounce and await thumbnail attempts before completion; permanent deletes acknowledge only after storage removal succeeds. A seed can then reload immediately without abandoning a pending thumbnail. Existing-file overwrites are not transactional: failure leaves mixed storage as described in the seed report. Failed post-write verification retains the current file and interrupted marker; it never deletes a path another client might have replaced. Request timeouts do not cancel a dispatched write or thumbnail operation.

Local socket clients connect to `ws://localhost:<editor-port>/__editor_protocol?role=client`. The editor connects as `role=editor`; one editor owns each server connection. The endpoint accepts loopback hosts only and rejects foreign browser origins. Request IDs are isolated per client. Disconnects fail outstanding requests without retrying mutations. Binary fields use the shared `stringifyProtocolJSON` / `parseProtocolJSON` codec: an ArrayBuffer is encoded as `{"$sparkBuffer":"<base64>"}`. That exact single-key shape is reserved by the codec.

The page handle and socket endpoint are development-only. Production still has the ordinary editor protocol handlers, but neither automation transport is installed.

Editor tabs retry a disconnected or occupied socket with backoff capped at five seconds. Closing the owning tab allows another tab to take over; outstanding mutations are never replayed. Socket frames are limited to 384 MiB, enough for a supported 256 MiB asset plus base64 and JSON framing. Scrub reports retain `x` and `y` as the measured source coordinates (or null when offscreen); selection itself uses the protocol.

Live coverage: start the paired servers with `driver.mjs up`, then run `node --test impower-dev/e2e/editorProtocol.test.mjs`. It uses an ephemeral browser context, seeds a tiny image project through the driver, checks its thumbnail cache, opens a script, awaits diagnostics, reads image hover dimensions and queries the local socket.
