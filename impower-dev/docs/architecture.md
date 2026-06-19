# impower-dev architecture

How the editor is put together at runtime. For the build/serve machinery, see
[`build-pipeline.md`](./build-pipeline.md); for a task-oriented walkthrough, see
[`adding-an-editor-feature.md`](./adding-an-editor-feature.md).

## The big picture

impower-dev is two things stacked together:

1. **A Fastify server** (`src/api`) that serves the built static assets and a
   few API routes (Google Drive sync, auth). In production it's the only
   process; in dev it has Vite mounted as middleware.
2. **A Preact single-page app** (`src/pages/index.ts` → `src/modules/spark-editor`)
   that *is* the editor. It runs in the browser, talks to several **workers**
   and **iframes**, and is pre-rendered to static HTML at build time (SSG) so
   the page is visible before its JavaScript loads.

```
                         ┌─────────────────────────────────────────────┐
  browser tab            │  impower-dev page (Preact)                   │
                         │                                              │
   reactive store ◄──────┤  WorkspaceStore (@preact/signals)            │
   (source of truth)     │     ▲ read (signals)   ▲ update (intents)    │
                         │     │                  │                     │
                         │  components ────────► Workspace.window  ──────┼──┐
                         │                       (the bridge)           │  │ spark-editor-
                         └──────────────────────────────────────────────┘  │ protocol
                                                                            │ (window
   ┌────────────────────────────────────────────────────────────────────┐ │ CustomEvent
   │ out-of-process peers (can't read the in-page signal)                │ │ bus +
   │  • OPFS / LSP / screenplay-PDF  workers   (new Worker("/x.js"))      │◄┘ postMessage)
   │  • game-player & screenplay-preview  <iframe>s                       │
   │  • CodeMirror editor-view controllers (sparkdown-document-views)     │
   └────────────────────────────────────────────────────────────────────┘
```

## State: the reactive store is the source of truth

In-page UI state lives in **`WorkspaceStore`** (`workspace/WorkspaceStore.ts`),
a [`@preact/signals`](https://preactjs.com/guide/v10/signals/) store:

- `workspace.state` — one signal holding the whole `WorkspaceCache` (which pane
  is open, the active editors, preview mode, project id, …).
- `workspace.signals.*` — `computed` slices (e.g. `workspace.signals.pane`,
  `workspace.signals.projectId`) so a component re-renders only when *its* slice
  changes.
- `workspace.current` — a plain getter/setter the controllers use to read/write
  the whole cache.

**Components read signals and render. They do not push their state anywhere.**

```tsx
// read — re-renders when preview.revealed flips
const active = useComputed(() => workspace.state.value.preview?.revealed ?? false).value;
```

### Intents update the store

UI events call **imperative intent methods** on `Workspace.window`
(`workspace/WorkspaceWindow.ts`): `openFileEditor`, `openPane`, `setPreviewMode`,
`expandPreviewPane`, … Each one updates the store via `this.update(...)`; every
component bound to the affected signal re-renders. That's the whole in-page
loop — **click → intent → store → reactive render**:

```tsx
const onClick = async () => {
  const { Workspace } = await import("../../workspace/Workspace");
  Workspace.window.openFileEditor(filename);   // updates the store; the editor pane renders
};
```

The methods are named as commands (`openFileEditor`, not `openedFileEditor`) on
purpose: they are the source of truth, not after-the-fact notifications. The
store — never a DOM event — is how in-page UI shares data. (This was not always
true; the editor was ported from web components, where a `window` event bus was
the *only* way to pass data between components. That bus is now reserved for the
cross-process boundary below.)

## Communication: the protocol bus is the cross-process boundary

Some peers can't read an in-page Preact signal, because they run in a different
JS realm:

- the **OPFS / LSP / screenplay-PDF workers** (`new Worker("/x.js")`),
- the **game-player** and **screenplay-preview** `<iframe>`s,
- the **CodeMirror editor-view controllers** in the reusable
  `@impower/sparkdown-document-views` package, which must stay decoupled from
  *this app's* store so it can also be used by the VS Code extension.

These communicate via **`@impower/spark-editor-protocol`** — JSON-RPC-shaped
messages dispatched on a `window` `CustomEvent` bus (and forwarded to/from
workers & iframes by `postMessage`).

### Requests vs. notifications

Every message is one of two kinds, and the distinction is load-bearing:

- a **request** (`MessageProtocolRequestType`) expects exactly one responder to
  **reply** — the sender may await the reply (`ShowDocument`,
  `ApplyWorkspaceEdit`, `GetGameVariables`, …);
- a **notification** (`MessageProtocolNotificationType`) is **one-way** — any
  number of listeners react, nobody replies (`DidChangeWatchedFiles`,
  `ScrolledEditor`, `CompiledProgram`, `GameStarted`, …).

> **The invariant:** a request must always be replied to; a notification must
> never be. If something "listens for a request" but doesn't reply, the message
> was mis-modeled — make it a **notification** so anyone can listen without
> implying a response. (Several fire-and-forget "requests" — the player→editor
> drag-drop relay, `SelectEditor` — were converted to notifications for exactly
> this reason; see git history.)

### The four helpers (`MessageProtocol` module)

Named `…ProtocolMessage` / `…ProtocolRequest` (not `send`/`onMessage`) so they
stay distinct from a Worker's `postMessage` / `onmessage` — this bus is in-page
`CustomEvent`s, not the worker/port channel.

- **`sendProtocolMessage(message, target = window)`** — dispatch any message
  (`SomeMessage.type.notification(...)` / `.request(...)`).
- **`onProtocolMessage(type, handler, target = window)`** — subscribe to a
  message; returns a disposer. The low-level listener used by transport relays
  and one-off component listeners (e.g. `FileList` ← `DidChangeWatchedFiles`).
- **`onProtocolRequest(type, handler, responseTarget = window)`** — subscribe to
  a **request**. The handler's return type is *required* to be that message's
  `Response` (inferred from the type's own `response()`), and the reply is sent
  automatically. **Forgetting to `return` the response is a compile error**, not
  a silently-dropped reply. (Returns `undefined` ⇒ no reply, for handlers that
  answer only when the message targets them.)
- **`ProtocolObserver`** — groups many subscriptions behind one `dispose()`, so
  a consumer with several listeners never hand-manages a disposer array. Its
  **`.onNotification(type, handler)`** carries a `response?: never` guard that
  *rejects request types*, and **`.onRequest(type, handler)`** is the request
  form — so the request/notification split is type-checked **both ways**. An
  optional constructor middleware wraps every handler (the game player uses it
  to bracket each handler with `performance` marks).

Use the standalone helpers for permanent singletons (`Workspace.window`); use a
`ProtocolObserver` for anything with a lifecycle to tear down (the CodeMirror
editor-view controllers, which create one and call `.dispose()` on unmount).

`Workspace.window` is the **bridge** between the two worlds:

- **Outbound** — `sendProtocolMessage(SomeMessage…)` broadcasts to peers:
  game control (`StartGameMessage`), editor commands
  (`SetEditorHighlightsMessage`, `SelectEditorMessage`), etc.
- **Inbound** — `registerProtocolHandlers()` subscribes via `onProtocolRequest`
  (for `ShowDocument` / `ApplyWorkspaceEdit`, which reply) and `onProtocolMessage`
  (for the rest — editor scroll/selection, `CompiledProgramMessage` from the
  compiler worker) and folds peer-originated events back into the store. This
  view→store direction is legitimate — the CodeMirror view genuinely *is* the
  source of truth for its own scroll position, and reports it up.

### The rule of thumb

> If a consumer is an in-page Preact component, share state through the
> **store** (signals + intents). Only reach for the protocol bus when the
> consumer is **out-of-process** (a worker, an iframe, or the framework-agnostic
> editor views).

A component subscribing with `onProtocolMessage(SomeMessage.type, …)` is correct
**only** when the event originates out-of-process — e.g. `FileList` reacting to
the OPFS worker's `DidChangeWatchedFilesMessage`, or `PreviewGame` reacting to
the player iframe's `GameStartedMessage`. If you find yourself listening for an
event that an in-page component *emitted*, that's the web-component
anti-pattern — use a signal instead.

## The `Workspace` singleton

`workspace/Workspace.ts` instantiates the controllers as a namespace:

```ts
export namespace Workspace {
  export const configuration = new WorkspaceConfiguration();
  export const window = new WorkspaceWindow();   // window/UI state + the protocol bridge
  export const ls = new WorkspaceLanguageServer(); //  new Worker("/sparkdown-language-server.js")
  export const fs = new WorkspaceFileSystem();     //  new Worker("/opfs-workspace.js")
  export const sync = new WorkspaceSync();         //  Google Drive sync
  export const print = new WorkspacePrint();       //  new Worker("/sparkdown-screenplay-pdf.js")
}
```

Importing `Workspace` instantiates three Workers, so it's import-time-heavy and
circular with `WorkspaceWindow` — tests mock it (see
[`adding-an-editor-feature.md`](./adding-an-editor-feature.md#testing)).

`WorkspaceWindow` is the largest controller (~1600 lines); it's sectioned by
concern and its class header documents the data-flow contract. A future split
into per-concern modules behind the `Workspace.window` facade is viable once a
shared "core" (store/update/emit/cache helpers) is extracted and the project
lifecycle/sync methods gain test coverage.

## Pre-rendering (SSG)

The page is server-side-rendered to static HTML at build time so it's styled
and visible before JS loads. `staticallyRenderPage` renders the root Preact
component (`spark-editor/preact-registry.ts`) into `<div id="root">`, and the
build inlines the editor's CSS (normalize + theme + compiled Tailwind) into a
`<style id="ssg-css">` block. The same root component then mounts on the client.
Details in [`build-pipeline.md`](./build-pipeline.md).

## Same-origin game preview (dev-only)

By default the editor (`localhost:8080`) embeds the game-preview player
(`sparkdown-player-app`, `localhost:5173`) as a **cross-origin** iframe and
drives it over `postMessage` RPC. That isolation makes debugging hard: the
editor page can't reach into the iframe's DOM
(`document.querySelector('#iframe').contentDocument` is `null`) or its
performance entries.

Set **`VITE_SAME_ORIGIN_PREVIEW=1`** (commented opt-in lines exist in both
`.env.development` files) to serve the player **same-origin** under the editor in
dev. To enable it you must set the flag in **both** apps and restart **both** dev
servers (`impower-dev` and `sparkdown-player-app`), since it's a build-time var:

- `impower-dev/.env.development` — gates the dev proxy in `build.ts`, which
  reverse-proxies `http://localhost:8080/__player/` → the player's Vite dev
  server (override its origin with `SPARKDOWN_PLAYER_DEV_ORIGIN`). It also flips
  `PreviewGame.tsx` to point the iframe `src` at `/__player/` and the RPC target
  origin at the editor's own origin.
- `sparkdown-player-app/.env.development` — sets the player's Vite `base` to
  `/__player/` so its HTML/asset URLs route back through the proxy, and makes
  `main.ts` skip its own service-worker registration (the editor's root-scoped SW
  already intercepts `/file:/` and serves game assets straight from OPFS, so it
  controls the same-origin iframe too). HMR connects directly to the player's port
  (not through the proxy).

If you run the player on a non-default port, set `SPARKDOWN_PLAYER_PORT` for the
player (it drives both the served port and the HMR client port) and point the
editor's `SPARKDOWN_PLAYER_DEV_ORIGIN` at the same `http://localhost:<port>`.

Because the iframe is now same-origin, the `postMessage` handshake matches
exactly with no origin relaxation, and the live game DOM is reachable from the
editor page / devtools / automation. **Production stays strict** (cross-origin
iframe + exact-origin RPC); this flag only affects the dev server and defaults
OFF.

Verify with the flag on: load `http://localhost:8080`, open the preview, then in
the editor page console
`document.querySelector('#iframe').contentDocument` is non-null.

### `window.__preview` inspector

When the flag is on, `PreviewGame` installs a small **`window.__preview`** helper
(`previewInspect.ts`) on the editor page so the live game DOM is ergonomic to
inspect from the console or automation (it's only installed in same-origin mode;
cross-origin it would be blocked anyway). It resolves the iframe lazily, so it
keeps working across preview reloads:

```js
__preview.summary()        // { mounted, sameOrigin, url, readyState, gameChildren, resourceEntries }
__preview.game()           // the live #game element
__preview.$('#game-ui')    // querySelector into the game document
__preview.deep('canvas')   // querySelectorAll that descends open shadow roots
__preview.perf('resource') // the iframe's performance entries
await __preview.ready()    // resolves once #game has rendered
```
