import { keymap, type EditorView, type KeyBinding } from "@codemirror/view";
import type { LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../src/modules/script-editor/utils/createEditorView";
import {
  EDITOR_SHORTCUT_COMMANDS,
  editorKeybindings,
  unlistedKeybindings,
} from "../src/modules/script-editor/utils/editorShortcuts";
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

  it("lists Escape only under the handler that receives it in the editor", () => {
    const view = liveEditor();
    const withEscape = editorKeybindings(view.state, "win")
      .filter((command) => command.keys.includes("Escape"))
      .map((command) => command.id);
    expect(withEscape).toEqual(["escape"]);
  });

  it("reads Find as Mod-f and Go to line as Mod-g from the live keymap", () => {
    const view = liveEditor();
    expect(keysOf(view, "search", "win")).toEqual(["Mod-f"]);
    expect(keysOf(view, "search", "mac")).toEqual(["Mod-f"]);
    expect(keysOf(view, "gotoLine", "win")).toContain("Mod-g");
    expect(keysOf(view, "findNext", "win")).not.toContain("Mod-g");
  });

  it("takes a Mac's own key where a binding has one", () => {
    const view = liveEditor();
    expect(keysOf(view, "redo", "win")).toContain("Mod-y");
    expect(keysOf(view, "redo", "mac")).toContain("Mod-Shift-z");
    expect(keysOf(view, "selectLine", "win")).toEqual(["Alt-l"]);
    expect(keysOf(view, "selectLine", "mac")).toEqual(["Ctrl-l"]);
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
