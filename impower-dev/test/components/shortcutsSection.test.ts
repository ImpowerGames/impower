import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { LiveRegion } = await import("@impower/impower-ui/components");
const { announcement } = await import("../../../packages/impower-ui/src/hooks/useAnnouncer");
const { default: ShortcutsSection } = await import(
  "../../src/modules/spark-editor/components/settings/ShortcutsSection"
);
const { SETTINGS_SCOPES } = await import("../../src/modules/spark-editor/components/settings/sections");
const { default: workspaceSettings, PREFERENCES_STORAGE_KEY, WorkspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { default: workspaceShortcuts, WorkspaceShortcuts } = await import(
  "../../src/modules/spark-editor/workspace/shortcuts/WorkspaceShortcuts"
);
const { SHORTCUT_PREFERENCE_KEYS, SHORTCUT_ROWS } = await import("../../src/modules/spark-editor/workspace/shortcuts/shortcutTable");
const { EDITOR_SHORTCUTS } = await import("@impower/codemirror-vscode-lsp-client/src/shortcutTable");

const section = SETTINGS_SCOPES[0].sections.find((info) => info.id === "shortcut-preferences")!;

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h("div", null, h(LiveRegion, null), h(ShortcutsSection, { section })), host!));
  return host;
};

const chip = (id: string) => host!.querySelector<HTMLButtonElement>(`[data-shortcut="${id}"]`)!;

const keysOf = (id: string) => [...chip(id).querySelectorAll("kbd")].map((kbd) => kbd.textContent);

const region = () => document.querySelector('[role="status"][aria-live="polite"]')!.textContent;

const record = async (id: string) => {
  await act(async () => {
    chip(id).focus();
    chip(id).click();
  });
  await settle();
};

const press = async (id: string, init: KeyboardEventInit) => {
  await act(async () => {
    chip(id).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
  await settle();
};

const rowReset = (id: string) =>
  chip(id).closest("[data-setting-row]")!.querySelector<HTMLButtonElement>("[data-reset-row]");

const stored = () => JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "{}") as Record<string, unknown>;

beforeEach(() => {
  workspaceSettings.resetPreferences(SHORTCUT_PREFERENCE_KEYS);
  localStorage.clear();
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  workspaceSettings.resetPreferences(SHORTCUT_PREFERENCE_KEYS);
  announcement.value = "";
});

describe("Keyboard shortcuts section", () => {
  it("lists the prototype's two groups first, then the rest, with a keys chip per command", async () => {
    await mount();
    expect(host!.querySelector("h3")!.textContent).toBe("Keyboard shortcuts");
    expect([...host!.querySelectorAll("legend")].map((legend) => legend.textContent)).toEqual([
      "Editing shortcuts",
      "Navigation shortcuts",
      "Lines and selection",
      "Find and problems",
      "Story and app",
    ]);
    const [editing, navigation] = [...host!.querySelectorAll("fieldset")].map((group) =>
      [...group.querySelectorAll("[data-setting-row] strong")].map((name) => name.textContent),
    );
    expect(editing).toEqual(["Undo", "Redo", "Format script", "Rename", "Show suggestions"]);
    expect(navigation).toEqual(["Fold a block", "Open a folded block", "Search", "Go to definition", "Find references"]);
    expect(keysOf("undo")).toEqual(["Ctrl", "Z"]);
    expect(keysOf("fold")).toEqual(["Ctrl", "Shift", "["]);
    expect(chip("undo").getAttribute("aria-label")).toBe("Undo shortcut: Ctrl+Z. Press to change.");
    expect(chip("playFromHere").textContent).toBe("None");
    const listed = [...host!.querySelectorAll<HTMLElement>("[data-shortcut]")].map((el) => el.dataset["shortcut"]);
    expect(listed).toEqual(SHORTCUT_ROWS.map((row) => row.id));
    const fixed = EDITOR_SHORTCUTS.filter((entry) => "fixed" in entry).map((entry) => entry.id);
    expect(fixed).toEqual(expect.arrayContaining(["indentWithTab", "newLine", "simplifySelection", "acceptSuggestion"]));
    expect(listed.filter((id) => fixed.includes(id as never))).toEqual([]);
    expect(rowReset("undo")).toBeNull();
    expect(host!.querySelector("[data-reset-all]")).toBeNull();
  });

  it("records Ctrl+Shift+F for Search, announces it and saves it as an override", async () => {
    await mount();
    await record("search");
    expect(chip("search").textContent).toBe("Press keys…");
    expect(region()).toBe("Press the keys for Search. Backspace takes the shortcut away; Esc keeps it.");
    await press("search", { key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
    expect(keysOf("search")).toEqual(["Ctrl", "Shift", "F"]);
    expect(region()).toBe("Search: Ctrl+Shift+F.");
    expect(workspaceShortcuts.combos.peek()["search"]).toBe("Mod+Shift+F");
    expect(stored()).toEqual({ shortcutSearch: "Mod+Shift+F" });
    const reloaded = new WorkspaceShortcuts(new WorkspaceSettings(signal("local"), localStorage), "linux");
    expect(reloaded.combos.peek()["search"]).toBe("Mod+Shift+F");
    expect(rowReset("search")).not.toBeNull();
    expect(host!.querySelector("[data-reset-all]")).not.toBeNull();
  });

  it("moves a combo another command holds, leaves that command without one, and a row's reset takes its keys back", async () => {
    await mount();
    await record("rename");
    await press("rename", { key: "s", code: "KeyS", ctrlKey: true });
    expect(keysOf("rename")).toEqual(["Ctrl", "S"]);
    expect(chip("format").textContent).toBe("None");
    expect(region()).toBe("Rename: Ctrl+S. It was Format script's, which has no shortcut now.");
    expect(stored()).toEqual({ shortcutRename: "Mod+S", shortcutFormat: "" });

    await act(async () => rowReset("rename")!.click());
    await settle();
    expect(keysOf("rename")).toEqual(["F2"]);
    expect(region()).toBe("Rename: F2 again.");
    expect(document.activeElement).toBe(chip("rename"));

    await act(async () => rowReset("format")!.click());
    await settle();
    expect(keysOf("format")).toEqual(["Ctrl", "S"]);
    expect(region()).toBe("Format script: Ctrl+S again.");
    expect(stored()).toEqual({});
  });

  it("takes a row's usual keys back from the command that holds them", async () => {
    await mount();
    await record("search");
    await press("search", { key: "F2", code: "F2" });
    expect(region()).toBe("Search: F2. It was Rename's, which has no shortcut now.");
    await act(async () => rowReset("rename")!.click());
    await settle();
    expect(keysOf("rename")).toEqual(["F2"]);
    expect(chip("search").textContent).toBe("None");
    expect(region()).toBe("Rename: F2 again. Search has no shortcut now.");
  });

  it("keeps the keys on Escape, clears them on Backspace and refuses keys that would be typing", async () => {
    await mount();
    await record("undo");
    await press("undo", { key: "Escape", code: "Escape" });
    expect(keysOf("undo")).toEqual(["Ctrl", "Z"]);
    expect(region()).toBe("Undo keeps Ctrl+Z.");

    await new Promise((resolve) => setTimeout(resolve, 450));
    await record("undo");
    await press("undo", { key: "Shift", code: "ShiftLeft", shiftKey: true });
    expect(chip("undo").textContent).toBe("Press keys…");
    await press("undo", { key: "q", code: "KeyQ" });
    expect(region()).toBe("Hold Ctrl or Alt with the key, or use a function key.");
    expect(chip("undo").textContent).toBe("Press keys…");
    await press("undo", { key: "Backspace", code: "Backspace" });
    expect(chip("undo").textContent).toBe("None");
    expect(region()).toBe("Undo has no shortcut now.");
    expect(stored()).toEqual({ shortcutUndo: "" });
  });

  it("records punctuation as typed on the key, whatever Shift makes it", async () => {
    await mount();
    await record("toggleComment");
    await press("toggleComment", { key: "?", code: "Slash", ctrlKey: true, shiftKey: true });
    expect(keysOf("toggleComment")).toEqual(["Ctrl", "Shift", "/"]);
    expect(workspaceShortcuts.combos.peek()["toggleComment"]).toBe("Mod+Shift+/");
  });

  it("restores every command with the section's Reset to defaults", async () => {
    await mount();
    await record("search");
    await press("search", { key: "F2", code: "F2" });
    await new Promise((resolve) => setTimeout(resolve, 450));
    await record("undo");
    await press("undo", { key: "Backspace", code: "Backspace" });
    await act(async () => host!.querySelector<HTMLButtonElement>("[data-reset-all]")!.click());
    await settle();
    expect(keysOf("search")).toEqual(["Ctrl", "F"]);
    expect(keysOf("rename")).toEqual(["F2"]);
    expect(keysOf("undo")).toEqual(["Ctrl", "Z"]);
    expect(stored()).toEqual({});
    expect(host!.querySelector("[data-reset-all]")).toBeNull();
  });
});
