import { EditorSelection } from "@codemirror/state";
import { searchPanelOpen } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import type { LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { SparkdownCodemirrorWorkspace } from "@impower/sparkdown-document-views/src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "@impower/sparkdown-document-views/src/modules/script-editor/utils/createEditorView";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_ON_APPEARANCE } from "../../../packages/sparkdown-document-views/test/fixtures/scriptAppearance";

const search = vi.hoisted(() => ({
  openFindFromSelection: vi.fn(),
  stepOrOpen: vi.fn(),
  close: vi.fn(),
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { search },
}));

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});

const { default: useFindShortcut } = await import(
  "../../src/modules/spark-editor/components/find-references-rename/useFindShortcut"
);
const { default: shortcuts } = await import(
  "../../src/modules/spark-editor/workspace/shortcuts/WorkspaceShortcuts"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { INITIAL_SEARCH } = await import(
  "../../src/modules/spark-editor/workspace/searchState"
);

Range.prototype.getClientRects ??= () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

let view: EditorView;
let host: HTMLElement;
const tools = {
  find: vi.fn(),
  findNext: vi.fn(),
  findPrevious: vi.fn(),
  rename: vi.fn(),
  references: vi.fn(),
};

const Hook = () => {
  useFindShortcut();
  return null;
};

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Hook, {}), host));
  const root = document.body.appendChild(document.createElement("div"));
  root.className = "sparkdown-script-editor-root";
  const worker = Object.assign(new EventTarget(), {
    postMessage: () => {},
  }) as unknown as Worker;
  [view] = createEditorView(root, {
    tools,
    shortcuts: shortcuts.combos.peek(),
    coarsePointer: false,
    appearance: ALL_ON_APPEARANCE,
    serverWorker: worker,
    serverConnection: { onRequest: () => ({ dispose: () => {} }) },
    serverInitializeParams: {},
    serverInitializeResult: {
      capabilities: { renameProvider: true, referencesProvider: true },
    },
    serverWorkspace: (client: LSPClient) =>
      new SparkdownCodemirrorWorkspace(client, {
        showDocument: async () => {},
        applyWorkspaceEdit: async () => ({ applied: false }),
      } as never),
    textDocument: {
      uri: "file:///main.sd",
      version: 0,
      text: "scene start\nend\n",
    },
    top: 0,
    bottom: 0,
  } as never);
  view.dispatch({ selection: { anchor: 8 } });
  view.focus();
};

const press = async (init: KeyboardEventInit) => {
  await act(async () =>
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        ...init,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    ),
  );
  await flush();
};

const pressOutside = async (init: KeyboardEventInit) => {
  await act(async () =>
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        ...init,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await flush();
};

beforeEach(() => {
  shortcuts.resetAll();
  vi.clearAllMocks();
  workspace.search.value = { ...INITIAL_SEARCH, open: true };
});

afterEach(async () => {
  view?.destroy();
  if (host) {
    await act(async () => render(null, host));
  }
  document.body.innerHTML = "";
  shortcuts.resetAll();
});

describe("Find's keys in the script follow the editor's configured shortcuts", () => {
  it("sends the default keys to the host's commands, once each, and never opens the old panel", async () => {
    await mount();
    await press({ key: "f", ctrlKey: true, keyCode: 70 });
    await press({ key: "F3", keyCode: 114 });
    await press({ key: "F3", shiftKey: true, keyCode: 114 });
    await press({ key: "F2", keyCode: 113 });
    await press({ key: "F12", shiftKey: true, keyCode: 123 });
    expect(tools.find).toHaveBeenCalledTimes(1);
    expect(tools.findNext).toHaveBeenCalledTimes(1);
    expect(tools.findPrevious).toHaveBeenCalledTimes(1);
    expect(tools.rename).toHaveBeenCalledTimes(1);
    expect(tools.references).toHaveBeenCalledTimes(1);
    expect(search.openFindFromSelection).not.toHaveBeenCalled();
    expect(search.stepOrOpen).not.toHaveBeenCalled();
    expect(searchPanelOpen(view.state)).toBe(false);
  });

  it("leaves Ctrl+F to Rename when the author gives it to Rename", async () => {
    expect(shortcuts.record("rename", "Mod+F").refused).toBeUndefined();
    await mount();
    await press({ key: "f", ctrlKey: true, keyCode: 70 });
    expect(tools.rename).toHaveBeenCalledTimes(1);
    expect(tools.find).not.toHaveBeenCalled();
    expect(search.openFindFromSelection).not.toHaveBeenCalled();
  });

  it("leaves F3 to Rename when the author gives it to Rename", async () => {
    expect(shortcuts.record("rename", "F3").refused).toBeUndefined();
    await mount();
    await press({ key: "F3", keyCode: 114 });
    expect(tools.rename).toHaveBeenCalledTimes(1);
    expect(tools.findNext).not.toHaveBeenCalled();
    expect(search.stepOrOpen).not.toHaveBeenCalled();
  });

  it("opens the shared search, not the old panel, from a reassigned Search key", async () => {
    expect(shortcuts.record("search", "Mod+J").refused).toBeUndefined();
    await mount();
    await press({ key: "j", ctrlKey: true, keyCode: 74 });
    expect(tools.find).toHaveBeenCalledTimes(1);
    expect(searchPanelOpen(view.state)).toBe(false);
  });
});

describe("Find's keys outside the script follow the same shortcuts", () => {
  it("opens Find from a reassigned key and no longer from the old one", async () => {
    expect(shortcuts.record("search", "Mod+J").refused).toBeUndefined();
    await mount();
    await pressOutside({ key: "f", ctrlKey: true, keyCode: 70 });
    expect(search.openFindFromSelection).not.toHaveBeenCalled();
    await pressOutside({ key: "j", ctrlKey: true, keyCode: 74 });
    await vi.waitFor(() =>
      expect(search.openFindFromSelection).toHaveBeenCalledTimes(1),
    );
  });

  it("does not step from F3 once F3 belongs to another command", async () => {
    expect(shortcuts.record("rename", "F3").refused).toBeUndefined();
    await mount();
    await pressOutside({ key: "F3", keyCode: 114 });
    expect(search.stepOrOpen).not.toHaveBeenCalled();
  });
});

describe("Escape in the script", () => {
  it("closes the search when the editor has nothing of its own to dismiss", async () => {
    await mount();
    await press({ key: "Escape", keyCode: 27 });
    await vi.waitFor(() => expect(search.close).toHaveBeenCalledTimes(1));
  });

  it("collapses extra carets first and leaves the search open", async () => {
    await mount();
    view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(2),
        EditorSelection.cursor(8),
      ]),
    });
    await press({ key: "Escape", keyCode: 27 });
    expect(view.state.selection.ranges).toHaveLength(1);
    expect(search.close).not.toHaveBeenCalled();
  });
});
