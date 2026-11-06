import { openSearchPanel, SearchQuery, setSearchQuery } from "@codemirror/search";
import {
  keymap,
  runScopeHandlers,
  type EditorView,
  type KeyBinding,
} from "@codemirror/view";
import type { LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../src/modules/script-editor/utils/createEditorView";
import {
  EDITOR_SHORTCUT_COMMANDS,
  editorKeybindings,
  unlistedKeybindings,
} from "../src/modules/script-editor/utils/editorShortcuts";
import {
  customGotoLinePanelOpen,
  openCustomGotoLinePanel,
} from "../src/modules/script-editor/utils/extensions/customSearch";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const views: EditorView[] = [];

const liveEditor = (coarsePointer = false) => {
  const parent = document.body.appendChild(document.createElement("div"));
  const worker = Object.assign(new EventTarget(), {
    postMessage: () => {},
  }) as unknown as Worker;
  const [view] = createEditorView(parent, {
    coarsePointer,
    appearance: ALL_ON_APPEARANCE,
    serverWorker: worker,
    serverConnection: { onRequest: () => ({ dispose: () => {} }) } as never,
    serverInitializeParams: {} as never,
    serverInitializeResult: { capabilities: {} } as never,
    serverWorkspace: (client: LSPClient) =>
      new SparkdownCodemirrorWorkspace(client, {
        showDocument: async () => {},
        applyWorkspaceEdit: async () => ({ applied: false }),
      } as never),
    textDocument: { uri: "file:///main.sd", version: 0, text: "scene start\n" },
    top: 0,
    bottom: 0,
  } as never) as unknown as [EditorView];
  views.push(view);
  return view;
};

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = "";
});

const keysOf = (view: EditorView, id: string, platform: "mac" | "win") =>
  editorKeybindings(view.state, platform).find((command) => command.id === id)
    ?.keys;

describe("the shortcuts the editor reports", () => {
  it.each([false, true])(
    "names a command for every binding the live editor registers (coarse pointer %s)",
    (coarse) => {
      const view = liveEditor(coarse);
      const unlisted = unlistedKeybindings(view.state).map(
        (binding) => binding.key ?? binding.mac ?? "?",
      );
      expect(unlisted).toEqual([]);
    },
  );

  it.each(["win", "mac"] as const)(
    "lists every live binding's key under its own command in the returned sheet (%s)",
    (platform) => {
      const view = liveEditor();
      const returned = editorKeybindings(view.state, platform);
      const claimedByEarlier = new Set(["PageUp", "PageDown", "Mod-g", "Escape"]);
      const missing: string[] = [];
      const check = (binding: KeyBinding, run: unknown, key: string) => {
        const id = EDITOR_SHORTCUT_COMMANDS.find(
          (command) =>
            command.runs?.includes(run as never) ||
            command.bindings?.includes(binding),
        )?.id;
        const listedUnder = returned
          .filter((command) => command.keys.includes(key))
          .map((command) => command.id);
        if (!id || listedUnder.length === 0) missing.push(`${key} (${id})`);
        else if (!claimedByEarlier.has(key) && !listedUnder.includes(id))
          missing.push(`${key} under ${id}`);
      };
      for (const binding of view.state.facet(keymap).flat()) {
        const key = binding[platform] ?? binding.key;
        if (!key) continue;
        if (binding.run) check(binding, binding.run, key);
        if (binding.shift) check(binding, binding.shift, `Shift-${key}`);
      }
      expect(missing).toEqual([]);
    },
  );

  it("gives Page Up and Down to the preview, whose binding always takes them", () => {
    const view = liveEditor();
    expect(keysOf(view, "previewBeat", "win")).toEqual(["PageUp", "PageDown"]);
    expect(keysOf(view, "movePage", "win")).not.toContain("PageUp");
    expect(keysOf(view, "movePage", "win")).not.toContain("PageDown");
    expect(keysOf(view, "selectPage", "win")).toContain("Shift-PageDown");
  });

  it("lists Escape only under the handlers that receive it: the editor's Find close and the Go to line panel's own", () => {
    const view = liveEditor();
    const withEscape = editorKeybindings(view.state, "win")
      .filter((command) => command.keys.includes("Escape"))
      .map((command) => command.id);
    expect(withEscape.sort()).toEqual(["closeGotoLine", "escape"]);
  });

  it("delivers the listed panel keys: Mod-g in Find steps to the next match, Escape in Go to line closes it", () => {
    const view = liveEditor();
    openSearchPanel(view);
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: "start" })),
    });
    const next = new KeyboardEvent("keydown", { key: "g", ctrlKey: true });
    expect(runScopeHandlers(view, next, "search-panel")).toBe(true);
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("start");
    expect(customGotoLinePanelOpen(view.state)).toBe(false);

    openCustomGotoLinePanel(view);
    expect(customGotoLinePanelOpen(view.state)).toBe(true);
    const escape = new KeyboardEvent("keydown", { key: "Escape" });
    expect(runScopeHandlers(view, escape, "gotoline-panel")).toBe(true);
    expect(customGotoLinePanelOpen(view.state)).toBe(false);
  });

  it("reads Find as Mod-f and Go to line as Mod-g from the live keymap", () => {
    const view = liveEditor();
    expect(keysOf(view, "search", "win")).toEqual(["Mod-f"]);
    expect(keysOf(view, "search", "mac")).toEqual(["Mod-f"]);
    expect(keysOf(view, "gotoLine", "win")).toContain("Mod-g");
    expect(keysOf(view, "findNext", "win")).toContain("Mod-g");
  });

  it("takes a Mac's own key where a binding has one", () => {
    const view = liveEditor();
    expect(keysOf(view, "redo", "win")).toContain("Mod-y");
    expect(keysOf(view, "redo", "mac")).toContain("Mod-Shift-z");
    expect(keysOf(view, "selectLine", "win")).toEqual(["Alt-l"]);
    expect(keysOf(view, "selectLine", "mac")).toEqual(["Ctrl-l"]);
    expect(keysOf(view, "toggleBlockComment", "win")).toEqual(["Alt-A"]);
    const shifted = new KeyboardEvent("keydown", { key: "A", altKey: true, shiftKey: true });
    const unshifted = new KeyboardEvent("keydown", { key: "a", altKey: true });
    expect(runScopeHandlers(view, unshifted, "editor")).toBe(false);
    expect(runScopeHandlers(view, shifted, "editor")).toBe(true);
  });

  it("lists a command with no binding with no keys", () => {
    const view = liveEditor();
    const all = editorKeybindings(view.state, "win");
    expect(all.find((command) => command.id === "splitLine")?.keys).toEqual(
      [],
    );
    expect(new Set(all.map((command) => command.id)).size).toBe(all.length);
  });
});
