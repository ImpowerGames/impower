import { openSearchPanel, SearchQuery, setSearchQuery } from "@codemirror/search";
import { runScopeHandlers, type EditorView } from "@codemirror/view";
import {
  assignShortcut,
  EDITOR_SHORTCUT_ROWS,
  editorShortcutEntries,
  resolveShortcuts,
  setEditorShortcuts,
  type LSPClient,
} from "@impower/codemirror-vscode-lsp-client/src";
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
      const unlisted = unlistedKeybindings(view.state).map((entry) => entry.id);
      expect(unlisted).toEqual([]);
    },
  );

  it.each(["win", "mac"] as const)(
    "lists a key under its own command for every keymap table entry the editor binds (%s)",
    (platform) => {
      const view = liveEditor();
      const returned = editorKeybindings(view.state, platform);
      const takenByEarlierCommand = new Set([
        "cursorPageUp",
        "cursorPageDown",
        "cursorPageUpByArrow",
        "cursorPageDownByArrow",
        "macPageDown",
        "simplifySelection",
        "closeReferences",
      ]);
      const missing = editorShortcutEntries(view.state, platform)
        .filter((entry) => entry.combos.length > 0 && !takenByEarlierCommand.has(entry.id))
        .filter((entry) => {
          const id = EDITOR_SHORTCUT_COMMANDS.find(
            (command) =>
              (entry.run && command.runs?.includes(entry.run)) ||
              command.entries?.includes(entry.id),
          )?.id;
          return !returned.find((command) => command.id === id)?.keys.length;
        })
        .map((entry) => entry.id);
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

  it("lists Escape only under the handlers that receive it: the suggestion list's close, the editor's Find close and the Go to line panel's own", () => {
    const view = liveEditor();
    const withEscape = editorKeybindings(view.state, "win")
      .filter((command) => command.keys.includes("Escape"))
      .map((command) => command.id);
    expect(withEscape.sort()).toEqual(["closeGotoLine", "closeSuggestions", "escape"]);
  });

  it("delivers the listed panel keys: F3 in Find steps to the next match, Escape in Go to line closes it", () => {
    const view = liveEditor();
    openSearchPanel(view);
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: "start" })),
    });
    const next = new KeyboardEvent("keydown", { key: "F3" });
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

  it("reads Find as Mod-f, Go to line as Mod-g and Next match as F3 from the keymap table", () => {
    const view = liveEditor();
    expect(keysOf(view, "search", "win")).toEqual(["Mod-f"]);
    expect(keysOf(view, "search", "mac")).toEqual(["Mod-f"]);
    expect(keysOf(view, "gotoLine", "win")).toContain("Mod-g");
    expect(keysOf(view, "findNext", "win")).toEqual(["F3"]);
  });

  it("takes a Mac's own key where a binding has one", () => {
    const view = liveEditor();
    expect(keysOf(view, "redo", "win")).toContain("Mod-y");
    expect(keysOf(view, "redo", "mac")).toContain("Mod-Shift-z");
    expect(keysOf(view, "selectLine", "win")).toEqual(["Alt-l"]);
    expect(keysOf(view, "selectLine", "mac")).toEqual(["Ctrl-l"]);
    expect(keysOf(view, "toggleBlockComment", "win")).toEqual(["Shift-Alt-a"]);
    const shifted = new KeyboardEvent("keydown", { key: "A", keyCode: 65, altKey: true, shiftKey: true });
    const unshifted = new KeyboardEvent("keydown", { key: "a", keyCode: 65, altKey: true });
    expect(runScopeHandlers(view, unshifted, "editor")).toBe(false);
    expect(runScopeHandlers(view, shifted, "editor")).toBe(true);
  });

  it("answers with the keys the writer recorded, not the defaults", () => {
    const view = liveEditor();
    const defaults = resolveShortcuts(EDITOR_SHORTCUT_ROWS, {}, "linux");
    const moved = assignShortcut(defaults, "rename", "Mod+F", "linux").combos;
    setEditorShortcuts(view, moved);
    const own = editorKeybindings(view.state, "linux");
    expect(own.find((command) => command.id === "rename")?.keys).toEqual(["Mod-f"]);
    expect(own.find((command) => command.id === "search")?.keys).toEqual([]);
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
