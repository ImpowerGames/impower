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
messages (`SomeMessage.type.request(...)` / `.notification(...)`) dispatched on
a `window` `CustomEvent` bus (and forwarded to/from workers & iframes by
`postMessage`).

`Workspace.window` is the **bridge** between the two worlds:

- **Outbound** — `this.emit(MessageProtocol.event, SomeMessage…)` broadcasts a
  protocol message to peers. Legitimate emits are all cross-process: game
  control (`StartGameMessage`), editor commands (`SetEditorHighlightsMessage`,
  `SelectEditorMessage`), request/response pairs (`ShowDocument`,
  `ApplyWorkspaceEdit`), and `DidExpand/CollapsePreviewPaneMessage` (consumed by
  the editor-view controllers).
- **Inbound** — `handleProtocol()` listens on the same bus and folds
  peer-originated events back into the store: editor scroll/selection
  (`ScrolledEditorMessage`, `SelectedEditorMessage`), `CompiledProgramMessage`
  from the compiler worker, etc. This view→store direction is legitimate — the
  CodeMirror view genuinely *is* the source of truth for its own scroll
  position, and reports it up.

### The rule of thumb

> If a consumer is an in-page Preact component, share state through the
> **store** (signals + intents). Only reach for `this.emit` / the protocol bus
> when the consumer is **out-of-process** (a worker, an iframe, or the
> framework-agnostic editor views).

A component listening to `window.addEventListener(MessageProtocol.event, …)` is
correct **only** when the event originates out-of-process — e.g. `FileList`
reacting to the OPFS worker's `DidChangeWatchedFilesMessage`, or `PreviewGame`
reacting to the player iframe's `GameStartedMessage`. If you find yourself
listening for an event that an in-page component *emitted*, that's the
web-component anti-pattern — use a signal instead.

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
