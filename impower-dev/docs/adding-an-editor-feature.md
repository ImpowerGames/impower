# Adding an editor feature

A task-oriented guide. Read [`architecture.md`](./architecture.md) first for the
why; this is the where and how.

## Where things live

```
src/modules/spark-editor/
  components/<feature>/<Feature>.tsx   a Preact component (one folder per feature)
  workspace/WorkspaceWindow.ts         UI-state intents + the protocol bridge
  workspace/WorkspaceStore.ts          the reactive store (signals)
  preact-registry.ts                   the root component tree
```

Components are plain Preact + Tailwind, styled shadcn-style on top of the
`@impower/impower-ui` primitives (`Button`, `Tabs`, …). There are **no web
components** — don't add `customElements.define` or `preact-custom-element`.

## A component template

```tsx
import { Button } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";

// Props default object doubles as the type source (see the impower-ui pattern).
export const propDefaults = {};
export type MyThingProps = Partial<typeof propDefaults>;

export default function MyThing(_props: MyThingProps) {
  // 1. READ state reactively from the store. Re-renders only when this slice changes.
  const pane = useComputed(() => workspace.state.value.pane).value;

  // 2. WRITE via an intent — never mutate the store from the component.
  const onClick = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.openPane("assets");
  };

  return <Button onClick={onClick}>{pane}</Button>;
}
```

`Workspace` is imported lazily (`await import`) in event handlers because it
instantiates Workers at module load — keep it out of the render path.

## Reading & writing state

- **Read:** `workspace.signals.<slice>.value` (pre-made computed slices like
  `pane`, `projectId`) or `useComputed(() => workspace.state.value.…)` for an
  ad-hoc slice. The component re-renders when that value changes.
- **Write:** call an intent on `Workspace.window` (`openFileEditor`,
  `setPreviewMode`, `expandPreviewPane`, …). If you need a new piece of UI
  state, add a field to `WorkspaceCache` and a new intent method that
  `this.update(...)`s it — follow the existing ones (each is a small store
  update inside the relevant section of `WorkspaceWindow.ts`).

**Do not** add a `window` CustomEvent to tell another in-page component
something changed — put it in the store and let that component read the signal.

## When to use the protocol bus

Only to talk to **out-of-process** peers (workers, iframes, the CodeMirror
editor views). The helpers live in `@impower/spark-editor-protocol`'s
`MessageProtocol` module (named `…ProtocolMessage` / `…ProtocolRequest` to stay
distinct from a Worker's `postMessage` / `onmessage`).

First decide whether your message is a **request** or a **notification**, and
pick the matching type when you define it:

- **Notification** (`MessageProtocolNotificationType`) — one-way, no reply.
  This is the default; reach for it unless a caller genuinely needs an answer.
- **Request** (`MessageProtocolRequestType`) — expects exactly one reply.
  > A request **must** be replied to; a notification **must not** be. If you
  > catch yourself handling a "request" without replying, make it a notification.

**Sending** (either kind):

```ts
sendProtocolMessage(StartGameMessage.type.request({})); // or .notification(...)
```

**Handling a notification** — `onProtocolMessage` returns a disposer; the
handler receives the message fully typed (no `instanceof` / `.type.is`):

```tsx
const dispose = onProtocolMessage(DidChangeWatchedFilesMessage.type, (message) => {
  // message: DidChangeWatchedFilesMessage
});
// later (e.g. a useEffect cleanup): dispose();
```

**Handling a request** — `onProtocolRequest` *requires* the handler to return
the message's `Response` and sends the reply for you. Forgetting to `return` is
a **compile error**, not a silently-dropped reply:

```ts
onProtocolRequest(ShowDocumentMessage.type, async (message) => {
  const result = await doTheThing(message.params);
  return ShowDocumentMessage.type.response(message.id, result); // required
});
```

If your consumer is a class with a lifecycle (e.g. an editor-view controller),
register through a **`ProtocolObserver`** instead of tracking disposers by hand
— `.onNotification` / `.onRequest` add to the group, and one `.dispose()` tears
them all down:

```ts
protected _protocols = new ProtocolObserver();
setup() {
  this._protocols
    .onNotification(DidExpandPreviewPaneMessage.type, (m) => this.handleExpand(m))
    .onRequest(LoadEditorMessage.type, (m) => this.handleLoad(m), this.host);
}
dispose() { this._protocols.dispose(); }
```

(`.onNotification` rejects request types at compile time, so the
request/notification split can't be crossed by accident.)

If both the emitter and the consumer are in-page Preact, you're using the wrong
tool — use the store.

## Testing

Tests run under vitest + jsdom (`npm test`). The `Workspace` singleton
instantiates Workers and circular-imports `WorkspaceWindow`, so **mock it**:

```ts
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs: { writeProjectMetadata: vi.fn() } }, // stub only what you call
}));

import workspace from "…/WorkspaceStore";
import WorkspaceWindow from "…/WorkspaceWindow";

it("openPane updates the store", () => {
  const win = new WorkspaceWindow();
  win.openPane("assets");
  expect(workspace.current.pane).toBe("assets");
});
```

See `test/workspace/WorkspaceWindow.test.ts` for the established patterns
(store-transition assertions, inbound protocol-event folding, the
`matchMedia`/`Worker` stubs in `test/setup.ts`). New intents should get a
characterization test here.

## Visual parity

The `../e2e-visual-parity` harness pixel- and computed-style-diffs the editor
against the web-component baseline. Run it before finishing UI work:

```sh
cd ../e2e-visual-parity && npm run parity   # needs ../impower (baseline) + this app built
```

Intentional restyles go in its allowlist; see
[`visual-parity-harness-spec.md`](./visual-parity-harness-spec.md). The two
skipped tests (a baseline startup race, an undrivable baseline menu) are known.

## Checklist

- [ ] Component reads state via signals, writes via an intent.
- [ ] No new in-page `window` CustomEvent (protocol bus is cross-process only).
- [ ] New `WorkspaceWindow` intent has a characterization test.
- [ ] `npm test`, `npm run build`, and the parity harness are green.
