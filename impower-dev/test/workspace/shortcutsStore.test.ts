import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ toggleGameRunning: 0, syncProject: 0 }));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    sync: { google: { getCurrentAccount: async () => null } },
    window: {
      setAccount: () => {},
      loadProject: async () => {},
      toggleGameRunning: () => {
        calls.toggleGameRunning += 1;
      },
      syncProject: async () => {
        calls.syncProject += 1;
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
