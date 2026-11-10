import { openSearchPanel, search } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorShortcuts, type ShortcutCommands } from "@impower/codemirror-vscode-lsp-client/src";
import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  toggleGameRunning: 0,
  syncProject: 0,
  steps: [] as string[],
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    sync: { google: { getCurrentAccount: async () => null } },
    window: {
      setAccount: () => {},
      loadProject: async () => {},
      reviewDeviceStorage: async () => {},
      toggleGameRunning: () => {
        calls.toggleGameRunning += 1;
      },
      syncProject: async () => {
        calls.syncProject += 1;
      },
      stepGame: async (traversal: string) => {
        calls.steps.push(traversal);
        return true;
      },
    },
  },
}));

const { default: workspaceSettings, PREFERENCES_STORAGE_KEY, WorkspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { default: workspaceShortcuts, WorkspaceShortcuts } = await import(
  "../../src/modules/spark-editor/workspace/shortcuts/WorkspaceShortcuts"
);
const { SHORTCUT_PREFERENCE_KEYS, SHORTCUT_ROWS } = await import(
  "../../src/modules/spark-editor/workspace/shortcuts/shortcutTable"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { useWorkspaceSession } = await import(
  "../../src/modules/spark-editor/components/main-window/useWorkspaceSession"
);

const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
};

const macShortcuts = (storage = memoryStorage()) =>
  new WorkspaceShortcuts(new WorkspaceSettings(signal("local"), storage), "mac");

const keydown = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

describe("the shortcuts store", () => {
  it("matches the Mac's own keys: Command for Mod and Control where the Mac used it", () => {
    const shortcuts = macShortcuts();
    expect(shortcuts.matches(keydown({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true }), "redo")).toBe(true);
    expect(shortcuts.matches(keydown({ key: "y", code: "KeyY", metaKey: true }), "redo")).toBe(true);
    expect(shortcuts.matches(keydown({ key: "z", code: "KeyZ", ctrlKey: true }), "undo")).toBe(false);
    expect(shortcuts.matches(keydown({ key: " ", code: "Space", ctrlKey: true }), "suggestions")).toBe(true);
    expect(shortcuts.label(shortcuts.combo("suggestions"))).toBe("⌃Space");
    expect(shortcuts.title("format", "Format script")).toBe("Format script (⌘S)");
    shortcuts.clear("redo");
    expect(shortcuts.matches(keydown({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true }), "redo")).toBe(false);
    expect(shortcuts.matches(keydown({ key: "y", code: "KeyY", metaKey: true }), "redo")).toBe(false);
  });

  it("saves only the commands that differ from their usual keys, and reads them back", () => {
    const storage = memoryStorage();
    const shortcuts = macShortcuts(storage);
    shortcuts.record("search", "Mod+Shift+F");
    shortcuts.record("undo", "Mod+Z");
    expect(JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual({ shortcutSearch: "Mod+Shift+F" });
    expect(macShortcuts(storage).combo("search")).toBe("Mod+Shift+F");
    shortcuts.restore("search");
    expect(JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual({});
  });

  it("refuses a combo a fixed editor key owns, and keeps every command as it was", () => {
    const storage = memoryStorage();
    const shortcuts = macShortcuts(storage);
    const before = shortcuts.combos.peek();
    expect(shortcuts.record("rename", "Mod+C")).toEqual({ combos: before, refused: "copy" });
    expect(shortcuts.record("search", "Ctrl+F")).toEqual({ combos: before, refused: "macCharRight" });
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
    expect(shortcuts.combo("rename")).toBe("F2");
  });

  it("rolls by choice on Shift with the beat keys, and by beat without it", () => {
    const shortcuts = macShortcuts();
    const page = (key: string, shiftKey: boolean) => keydown({ key, code: key, shiftKey });
    expect(shortcuts.matches(page("PageUp", true), "previousChoice")).toBe(true);
    expect(shortcuts.matches(page("PageDown", true), "nextChoice")).toBe(true);
    expect(shortcuts.matches(page("PageUp", false), "previousBeat")).toBe(true);
    expect(shortcuts.matches(page("PageUp", false), "previousChoice")).toBe(false);
  });

  it("matches a letter by the key the layout types", () => {
    const shortcuts = macShortcuts();
    shortcuts.record("search", "Mod+Y");
    expect(shortcuts.matches(keydown({ key: "y", code: "KeyZ", metaKey: true }), "search")).toBe(true);
    expect(shortcuts.matches(keydown({ key: "y", code: "KeyZ", metaKey: true }), "undo")).toBe(false);
  });

  it("ignores saved keys that are not a shortcut and settles saved collisions in table order", () => {
    const storage = memoryStorage();
    storage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ shortcutRename: "Mod+F", shortcutSearch: "Mod+F", shortcutUndo: "Q" }),
    );
    const shortcuts = macShortcuts(storage);
    expect(shortcuts.combo("rename")).toBe("Mod+F");
    expect(shortcuts.combo("search")).toBe("");
    expect(shortcuts.combo("undo")).toBe("Mod+Z");
  });

  it("gives every listed command a preference key", () => {
    expect(SHORTCUT_PREFERENCE_KEYS).toHaveLength(SHORTCUT_ROWS.length);
    expect(SHORTCUT_PREFERENCE_KEYS).toContain("shortcutPlayFromHere");
    expect(new Set(SHORTCUT_PREFERENCE_KEYS).size).toBe(SHORTCUT_PREFERENCE_KEYS.length);
  });
});

describe("the app's own shortcuts", () => {
  let host: HTMLDivElement | undefined;

  function Session() {
    useWorkspaceSession();
    return null;
  }

  beforeEach(async () => {
    calls.toggleGameRunning = 0;
    calls.syncProject = 0;
    workspaceSettings.resetPreferences([...SHORTCUT_PREFERENCE_KEYS, "previewMode"]);
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(Session, null), host!));
  });

  afterEach(async () => {
    await act(async () => render(null, host!));
    host!.remove();
    workspaceSettings.resetPreferences([...SHORTCUT_PREFERENCE_KEYS, "previewMode"]);
  });

  const fire = async (init: KeyboardEventInit) => {
    const event = keydown(init);
    await act(async () => {
      window.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return event;
  };

  describe("the debugger's step keys", () => {
    const playing = (running: boolean) => {
      workspace.current = {
        ...workspace.current,
        preview: {
          ...workspace.current.preview,
          modes: {
            ...workspace.current.preview.modes,
            game: { running, paused: running },
          },
        },
      };
    };

    beforeEach(() => {
      calls.steps = [];
    });

    afterEach(() => {
      playing(false);
    });

    it("steps with F10, F11 and Shift+F11 during a run, keeping the browser out of it", async () => {
      playing(true);
      const over = await fire({ key: "F10", code: "F10" });
      const into = await fire({ key: "F11", code: "F11" });
      const out = await fire({ key: "F11", code: "F11", shiftKey: true });
      expect(calls.steps).toEqual(["over", "in", "out"]);
      expect([over, into, out].map((event) => event.defaultPrevented)).toEqual([true, true, true]);
    });

    it("also steps with Ctrl+F11 and Ctrl+Shift+F11 where the browser keeps F11", async () => {
      playing(true);
      await fire({ key: "F11", code: "F11", ctrlKey: true });
      await fire({ key: "F11", code: "F11", ctrlKey: true, shiftKey: true });
      expect(calls.steps).toEqual(["in", "out"]);
    });

    it("leaves the keys to the browser with no run", async () => {
      playing(false);
      const event = await fire({ key: "F11", code: "F11" });
      expect(calls.steps).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    });

    it("lists the three steps under Story and app with their usual keys", () => {
      expect(
        ["stepOver", "stepInto", "stepOut"].map((id) => [
          SHORTCUT_ROWS.find((row) => row.id === id)?.group,
          workspaceShortcuts.usual(id as never),
          workspaceShortcuts.active(id as never),
        ]),
      ).toEqual([
        ["story", "F10", ["F10"]],
        ["story", "F11", ["F11", "Mod+F11"]],
        ["story", "Shift+F11", ["Shift+F11", "Mod+Shift+F11"]],
      ]);
    });

    it("offers the Mac the Control keys, because the system keeps F11 there", () => {
      const mac = macShortcuts();
      expect(mac.usual("stepOver" as never)).toBe("F10");
      expect(mac.usual("stepInto" as never)).toBe("Ctrl+F11");
      expect(mac.usual("stepOut" as never)).toBe("Ctrl+Shift+F11");
    });
  });

  it("plays from here on the keys recorded for it, and only while the preview shows the game", async () => {
    await fire({ key: "Enter", code: "Enter", ctrlKey: true, altKey: true });
    expect(calls.toggleGameRunning).toBe(0);
    workspaceShortcuts.record("playFromHere", "Mod+Alt+Enter");
    const event = await fire({ key: "Enter", code: "Enter", ctrlKey: true, altKey: true });
    expect(calls.toggleGameRunning).toBe(1);
    expect(event.defaultPrevented).toBe(true);
    workspaceSettings.setPreference("previewMode", "screenplay");
    await fire({ key: "Enter", code: "Enter", ctrlKey: true, altKey: true });
    expect(calls.toggleGameRunning).toBe(1);
  });

  it("runs only the command the event reaches first, as the editor does, when one press names two recorded combos", async () => {
    workspaceShortcuts.record("format", "Mod+Shift+,");
    workspaceShortcuts.record("search", "Mod+;");
    const german = { key: ";", code: "Comma", keyCode: 188, ctrlKey: true, shiftKey: true };
    expect(workspaceShortcuts.matches(keydown(german), "search")).toBe(true);
    expect(workspaceShortcuts.matches(keydown(german), "format")).toBe(false);
    await fire(german);
    expect(calls.syncProject).toBe(0);
    await fire({ key: "<", code: "Comma", keyCode: 188, ctrlKey: true, shiftKey: true });
    expect(calls.syncProject).toBe(1);
  });

  describe("with a script editor that handles the press first", () => {
    const germanCommaShifted = { key: ";", code: "Comma", keyCode: 188, ctrlKey: true, shiftKey: true };
    let view: EditorView | undefined;

    afterEach(() => {
      view?.destroy();
      view?.dom.parentElement?.remove();
      view = undefined;
    });

    const mountEditor = (commands: ShortcutCommands, withSearch = false) => {
      view = new EditorView({
        parent: document.body.appendChild(document.createElement("div")),
        state: EditorState.create({
          doc: "line one",
          extensions: [
            ...(withSearch ? [search()] : []),
            editorShortcuts({ combos: workspaceShortcuts.combos.peek(), platform: "linux", commands }),
          ],
        }),
      });
      return view;
    };

    const mountStepEditor = (withSearch = false) => {
      view = new EditorView({
        parent: document.body.appendChild(document.createElement("div")),
        state: EditorState.create({
          doc: "line one",
          extensions: [
            ...(withSearch ? [search()] : []),
            editorShortcuts({ combos: workspaceShortcuts.editorCombos.peek(), platform: "linux" }),
          ],
        }),
      });
      return view;
    };

    const stepping = (running: boolean) => {
      workspace.current = {
        ...workspace.current,
        preview: {
          ...workspace.current.preview,
          modes: {
            ...workspace.current.preview.modes,
            game: { running, paused: running },
          },
        },
      };
    };

    const pressIn = async (target: Element, init: KeyboardEventInit) => {
      const event = keydown(init);
      await act(async () => {
        target.dispatchEvent(event);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      return event;
    };

    it("leaves F10 and F11 to the browser from the script with no run", async () => {
      calls.steps = [];
      stepping(false);
      const editor = mountStepEditor();
      const over = await pressIn(editor.contentDOM, { key: "F10", code: "F10", keyCode: 121 });
      const into = await pressIn(editor.contentDOM, { key: "F11", code: "F11", keyCode: 122 });
      expect([over.defaultPrevented, into.defaultPrevented]).toEqual([false, false]);
      expect(calls.steps).toEqual([]);
    });

    it("leaves F11 to the browser from the search field with no run", async () => {
      calls.steps = [];
      stepping(false);
      const editor = mountStepEditor(true);
      openSearchPanel(editor);
      const field = editor.dom.querySelector("input.cm-textfield")!;
      const event = await pressIn(field, { key: "F11", code: "F11", keyCode: 122 });
      expect(event.defaultPrevented).toBe(false);
    });

    it("steps from the script during a run", async () => {
      calls.steps = [];
      stepping(true);
      try {
        const editor = mountStepEditor();
        const event = await pressIn(editor.contentDOM, { key: "F10", code: "F10", keyCode: 121 });
        expect(event.defaultPrevented).toBe(true);
        expect(calls.steps).toEqual(["over"]);
      } finally {
        stepping(false);
      }
    });

    it("gives the editor the same combos object until a run starts or stops", () => {
      stepping(false);
      const idle = workspaceShortcuts.editorCombos.peek();
      expect(idle["stepOver"]).toBeUndefined();
      stepping(false);
      expect(workspaceShortcuts.editorCombos.peek()).toBe(idle);
      stepping(true);
      try {
        expect(workspaceShortcuts.editorCombos.peek()["stepOver"]).toBe("F10");
      } finally {
        stepping(false);
      }
    });

    it("plays from here on the keys recorded for it in the editor, before the editor reaches Format's later name for the same press", async () => {
      workspaceShortcuts.record("playFromHere", "Mod+;");
      workspaceShortcuts.record("format", "Mod+Shift+,");
      const format = vi.fn(() => true);
      const editor = mountEditor({ format });
      await pressIn(editor.contentDOM, germanCommaShifted);
      expect(calls.toggleGameRunning).toBe(1);
      expect(format).not.toHaveBeenCalled();
      expect(calls.syncProject).toBe(0);
    });

    it("plays from here instead of indenting the script when Indent holds the press's later name", async () => {
      workspaceShortcuts.record("playFromHere", "Mod+;");
      workspaceShortcuts.record("indent", "Mod+Shift+,");
      const editor = mountEditor({});
      editor.dispatch({ selection: { anchor: 0 } });
      await pressIn(editor.contentDOM, germanCommaShifted);
      expect(editor.state.doc.toString()).toBe("line one");
      expect(calls.toggleGameRunning).toBe(1);
    });

    it("plays from here on its recorded keys pressed while the search field has focus", async () => {
      workspaceShortcuts.record("playFromHere", "Mod+Alt+P");
      const editor = mountEditor({}, true);
      openSearchPanel(editor);
      const field = editor.dom.querySelector(".cm-search input[name=search]")!;
      await pressIn(field, { key: "p", code: "KeyP", keyCode: 80, ctrlKey: true, altKey: true });
      expect(calls.toggleGameRunning).toBe(1);
    });

    it("syncs when Fold declined and the editor went on to run Format", async () => {
      workspaceShortcuts.record("fold", "Mod+;");
      workspaceShortcuts.record("format", "Mod+Shift+,");
      const format = vi.fn(() => true);
      const editor = mountEditor({ fold: () => false, format });
      await pressIn(editor.contentDOM, germanCommaShifted);
      expect(format).toHaveBeenCalledTimes(1);
      expect(calls.syncProject).toBe(1);
    });

    it("does not sync when the search panel's scope ran Search", async () => {
      workspaceShortcuts.record("format", "Mod+;");
      workspaceShortcuts.record("search", "Mod+Shift+,");
      const searchCommand = vi.fn(() => true);
      const format = vi.fn(() => true);
      const editor = mountEditor({ format, search: searchCommand }, true);
      openSearchPanel(editor);
      const field = editor.dom.querySelector(".cm-search input[name=search]")!;
      await pressIn(field, germanCommaShifted);
      expect(searchCommand).toHaveBeenCalledTimes(1);
      expect(format).not.toHaveBeenCalled();
      expect(calls.syncProject).toBe(0);
    });

    it("does not move the preview a beat when the suggestion list took PageDown", async () => {
      const editor = mountEditor({ nextSuggestionPage: () => true, nextBeat: () => true });
      const event = await pressIn(editor.contentDOM, { key: "PageDown", code: "PageDown", keyCode: 34 });
      expect(workspaceShortcuts.matches(event, "nextBeat")).toBe(false);
    });

    it("moves the preview a beat when the editor's own beat key ran", async () => {
      const editor = mountEditor({ nextSuggestionPage: () => false, nextBeat: () => true });
      const event = await pressIn(editor.contentDOM, { key: "PageDown", code: "PageDown", keyCode: 34 });
      expect(workspaceShortcuts.matches(event, "nextBeat")).toBe(true);
    });
  });

  it("lists the app's own keys in the Writing tools sheet from the recorded combos", async () => {
    const { appShortcuts } = await import("../../src/modules/spark-editor/components/writing-tools/shortcuts");
    const keysOf = (id: string) => appShortcuts().find((row) => row.id === id)?.keys;
    expect(keysOf("sync")).toEqual(["Mod-s", "Shift-Alt-f"]);
    expect(keysOf("redoFileChange")).toEqual(["Mod-y", "Mod-Shift-z"]);
    expect(keysOf("playFromHere")).toEqual([]);
    workspaceShortcuts.record("format", "Mod+Shift+X");
    workspaceShortcuts.record("playFromHere", "Mod+Alt+P");
    expect(keysOf("sync")).toEqual(["Mod-Shift-x", "Shift-Alt-f"]);
    expect(keysOf("playFromHere")).toEqual(["Mod-Alt-p"]);
  });

  it("syncs on Format script's keys, wherever they are recorded", async () => {
    await fire({ key: "s", code: "KeyS", ctrlKey: true });
    expect(calls.syncProject).toBe(1);
    workspaceShortcuts.record("format", "Mod+Shift+X");
    await fire({ key: "s", code: "KeyS", ctrlKey: true });
    expect(calls.syncProject).toBe(1);
    await fire({ key: "X", code: "KeyX", ctrlKey: true, shiftKey: true });
    expect(calls.syncProject).toBe(2);
  });
});
