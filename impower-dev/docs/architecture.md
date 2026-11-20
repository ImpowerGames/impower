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
   and **iframes**. Its page shell is built to static HTML (SSG) with the
   editor's CSS inlined; the editor itself renders on the client.

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

## The shell, the routes and the layouts

The editor is one window, `MainWindow` (`components/main-window/MainWindow.tsx`),
inside `WorkspaceShell` (`components/desktop-shell/WorkspaceShell.tsx`). The shell
draws the frame every page shares; the page inside it is chosen by the route.

### Routes

`workspace/routes.ts` holds the five routes and the URL hash that names each:

| Route | Hash | Page | Shown by |
|---|---|---|---|
| Story | `#story` | The script editor, its header and the Outline | `components/logic/Logic.tsx` with `components/script-header/`, `components/outline/` |
| Scripts | `#scripts` | Every script of the project, in folders | `components/scripts-page/ScriptsPage.tsx` |
| Assets | `#assets` | Images, sounds, fonts and links, in folders, with the asset inspector | `components/assets/Assets.tsx`, `components/asset-inspector/` |
| Share | `#share` | Exports of the game and the screenplay | `components/share/SharePage.tsx` |
| Settings | `#settings` | Editor and project preferences; `#settings?section=<id>` opens one section | `components/settings/SettingsPage.tsx` |

The route is derived from the store (`routeOfState`), never kept beside it: the
open pane, the Story pane's view and `screen.settingsOpen` decide it, and
`stateForRoute` is the one function that changes them for a route.

The old names `#write`, `#logic`, `#main`, `#collection` and `#project` open
their page through `LEGACY_ROUTES` and the address bar is rewritten to the
current name, keeping a Settings `?section=`. `LEGACY_ROUTES_REMOVAL_DATE`
(2027-02-18) is when the redirects go.

### Layouts

The layout is decided by width alone, through the breakpoints module of
`@impower/impower-ui` (`packages/impower-ui/src/layout/breakpoints.ts`), and touch
affordances by pointer:

| Layout | Width | Frame |
|---|---|---|
| `phone` | 700px and narrower | `PhoneTitleBar` on top, `BottomNavigation` at the bottom, one page at a time; the preview is its own pane |
| `compact` | 701px to 1100px | The rail on the left, the preview pinned as a resizable band above the page |
| `desktop` | 1101px and wider | `TopBar`, the rail on the left, the page, and the preview docked beside it in a `SplitPane` |

The rail shows its labels from 1001px and only its icons below that
(`railFullMinWidth`). The pointer is `coarse` under `(hover: none) and (pointer: coarse)`.
`media.ts` writes each value to the root element as `data-layout`, `data-pointer`
and `data-rail`, so CSS reads the same decision the hooks `useLayout`,
`useCoarsePointer` and `useRailDefault` return. No other code reads a width, a user
agent or a second breakpoint.

### The rail, the bars and the dock

- **The rail** (`desktop-shell/ShellRail.tsx`): links to Story, Assets and Share, the
  Settings index under them on the Settings page, and the app menu at its foot (`AppMenu.tsx`), labelled with the save status, which holds Settings.
  Its width is stored in the workspace (`shell.railWidth`, `shell.railCompactWidth`)
  and bounded by `workspace/railWidths.ts`.
- **The top bar** (`desktop-shell/TopBar.tsx`): the project name field
  (`ProjectNameField.tsx`) and the save status line, and the search field
  (`TitleBarSearch.tsx`) when the rail is collapsed to its icons. On phones `PhoneTitleBar.tsx` and `PhoneSearch` take its place,
  and `AppMenu.tsx` holds what the rail holds on wider screens.
- **The preview dock** (`components/preview/Preview.tsx`): the preview top bar
  (`preview-top-bar/`), the game (`preview-game/`) or the screenplay
  (`preview-screenplay/`), and the bar under them (`preview-bar/`) with the Problems
  toggle. At compact width it sits in the strip `preview-strip/PhonePreviewStrip.tsx`;
  on phones it opens as its own pane with Back to story.
- **The asset inspector dock** (`asset-inspector/dock.tsx`): the inspector docks
  beside the Assets page at desktop width and opens as a sheet at compact and phone widths.

### The settings store

Preferences are declared once in `workspace/settings/settingsSchema.ts`: each key has
its default and, where it has them, its choices, maximum length and the configuration
keys it is mirrored to. `workspace/settings/WorkspaceSettings.ts` holds them as a
signal, stores them in `localStorage` and derives what the editor reads (the theme,
the script appearance); components read them with `useSettings` and write through
the store, never to storage. `applyTheme.ts` sets the root's `data-theme`. Project
preferences (metadata, screenplay settings, the Add menu's folders, file types) live
in the project instead, so they travel with it: the metadata in a front matter block at the top of Main, the rest in the project's `.vscode/settings.json` (`settingsJson.ts`).

### Component map

Each feature folder under `src/modules/spark-editor/components/` exposes one entry
(`index.ts` where it has more than one component) and composes
`@impower/impower-ui`; no folder imports another's internals.

| Surface | Folder |
|---|---|
| The window: shell, page, preview dock and strip by layout | `main-window/` |
| Shell: rail, top bar, phone title bar, bottom navigation, app menu, project name | `desktop-shell/` |
| Story page: the script editor | `logic/`, `logic-script-editor/`, `logic-scripts-editor/` |
| Script name and the script's header | `script-header/` |
| Outline | `outline/` |
| Writer's bar (Indent, Dedent, Format and the editing keys) | `writer-bar/` |
| Writing tools menu, keyboard shortcuts sheet, Sparkdown guide | `writing-tools/` |
| Add menu and its pickers | `add-panel/`, in the panel frame `tool-panel/` |
| Find, references and rename | `find-references-rename/` |
| Problems panel and the Problems to fix dialog | `problems/` |
| Scripts page | `scripts-page/`, on the shared page frame `library-page/` |
| Assets page | `assets/`, `library-page/`, `file-dropzone/` |
| Asset inspector and its variants tester | `asset-inspector/` |
| Share page | `share/` |
| Settings page and its sections | `settings/` |
| Preview: top bar, game, screenplay, bar, saves, strip, route view | `preview/`, `preview-top-bar/`, `preview-game/`, `preview-screenplay/`, `preview-bar/`, `preview-saves/`, `preview-strip/`, `preview-route/` |
| Save and sync status, Drive sync, conflicts | `drive-sync/`, `conflict-dialog/` |
| Import progress and replacing a project | `import-progress-bar/`, `replace-project/` |
| Recycle bin: deleted files and their Restore | `trash-panel/`, opened from the folder-path menu (`library-page/Trail.tsx`) |
| Toasts | `snackbar-host/` |

The primitives these compose (buttons, menus, dialogs and sheets, rows, the rail
index, the split pane, icons) are in `packages/impower-ui/src/components/`; its
[README](../../packages/impower-ui/README.md) holds the rules for adding one.

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
store — never a DOM event — is how in-page UI shares data. The `window` event bus
is reserved for the cross-process boundary below.

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
> implying a response. The player→editor drag-drop relay and `SelectEditor` are
> notifications for this reason.

### The four helpers (`MessageProtocol` module)

Named `…ProtocolMessage` / `…ProtocolRequest` (not `send`/`onMessage`) so they
stay distinct from a Worker's `postMessage` / `onmessage` — this bus is in-page
`CustomEvent`s, not the worker/port channel.

- **`sendProtocolMessage(message, target = window)`** — dispatch any message
  (`SomeMessage.type.notification(...)` / `.request(...)`).
- **`onProtocolMessage(type, handler, target = window)`** — subscribe to a
  message; returns a disposer. The low-level listener used by transport relays
  and one-off component listeners (e.g. the Settings page's `useProjectFiles` ← `DidChangeWatchedFiles`).
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
**only** when the event originates out-of-process — e.g. `useProjectFiles` reacting to
the OPFS worker's `DidChangeWatchedFilesMessage`, or `PreviewGame` reacting to
the player iframe's `GameStartedMessage`. If you find yourself listening for an
event that an in-page component *emitted*, that's the web-component
anti-pattern — use a signal instead.

## The `Workspace` singleton

`workspace/Workspace.ts` instantiates the controllers as a namespace:

```ts
export namespace Workspace {
  export const configuration = new WorkspaceConfiguration();
  export const window: WorkspaceWindow = new WorkspaceWindow(Workspace); // window/UI state + the protocol bridge
  export const ls: WorkspaceLanguageServer = new WorkspaceLanguageServer(Workspace); // sparkdown-language-server worker
  export const fs: WorkspaceFileSystem = new WorkspaceFileSystem(ls, configuration); // opfs-workspace worker
  export const sync = new WorkspaceSync();         //  Google Drive sync
  export const print = new WorkspacePrint();       //  sparkdown-screenplay-pdf worker
}
```

Each controller starts its worker at `getWorkerUrl(name, import.meta.env.BUILD_ID)` (`src/workers/workerUrl.ts`): `/<name>.<build>.js` in a production build, `/<name>.js` in development. See [Workers](./build-pipeline.md#workers).

The controllers never import `Workspace` at runtime. Each receives what it uses through its constructor: `WorkspaceFileSystem` the language server and configuration, `WorkspaceWindow` and `WorkspaceLanguageServer` the namespace object itself, because the services they read (`fs` and `sync`, `configuration` and `window`) are constructed after them; they read those members only when a handler or method runs, by which time every member is assigned. `registerWorkspaceProtocol`, which `Workspace.ts` calls once the namespace is built, receives it the same way for the `ls` and `fs` its handlers use. The explicit member types stop TypeScript inferring them through the namespace they are passed.

Importing `Workspace` instantiates three Workers, so it's import-time-heavy: tests construct the controllers directly with stubbed services, and mock `Workspace` only where the code under test reads the singleton (see [`adding-an-editor-feature.md`](./adding-an-editor-feature.md#testing)).

`WorkspaceWindow` is the largest controller: the window intents and the protocol
bridge live there.

## Pre-rendering (SSG)

The page shell is built to static HTML so it's styled before JS loads:
`staticallyRenderPage` fills the document template, leaving `<div id="root">`
empty, and the build inlines the editor's CSS (normalize + theme + compiled
Tailwind) into a `<style id="ssg-css">` block. The root component
(`spark-editor/preact-registry.ts`) renders on the client, so every control
appears with its handlers attached; the dev server serves the same empty root.
Server-render tests load the root through `preact-registry.ts` directly.
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
