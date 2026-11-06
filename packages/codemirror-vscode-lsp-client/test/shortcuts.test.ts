import { closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { foldKeymap } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  codeMirrorKey,
  comboFromEvent,
  comboLabel,
  comboParts,
  isShortcutCombo,
  type ShortcutPlatform,
} from "../src/shortcutCombo";
import {
  activeCombos,
  assignShortcut,
  resolveShortcuts,
  restoreShortcut,
} from "../src/shortcutRules";
import {
  editorShortcuts,
  setEditorShortcuts,
  shortcutKeyBindings,
  shortcutLabelFor,
  type EditorShortcutsState,
  EDITOR_SHORTCUT_COMMANDS,
  type ShortcutCommands,
} from "../src/shortcuts";
import { EDITOR_SHORTCUT_ROWS, type ShortcutRow } from "../src/shortcutTable";

const PLATFORMS: readonly ShortcutPlatform[] = ["mac", "win", "linux"];

const rowOf = (id: string): ShortcutRow =>
  EDITOR_SHORTCUT_ROWS.find((row) => row.id === id)!;

const defaults = (platform: ShortcutPlatform) =>
  resolveShortcuts(EDITOR_SHORTCUT_ROWS, {}, platform);

let views: EditorView[] = [];

afterEach(() => {
  views.forEach((view) => view.destroy());
  views = [];
  document.body.innerHTML = "";
});

const mountEditor = (extension: Parameters<typeof editorShortcuts>[0]) => {
  const view = new EditorView({
    parent: document.body.appendChild(document.createElement("div")),
    state: EditorState.create({ doc: "line one\nline two", extensions: editorShortcuts(extension) }),
  });
  views.push(view);
  return view;
};

const press = (view: EditorView, init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  view.contentDOM.dispatchEvent(event);
  return event;
};

describe("recording a combo from a key event", () => {
  it("reads punctuation from the key's code, so Shift does not change it", () => {
    expect(comboFromEvent({ code: "BracketLeft", key: "{", ctrlKey: true, shiftKey: true }, "win")).toBe(
      "Mod+Shift+[",
    );
    expect(comboFromEvent({ code: "Slash", key: "?", ctrlKey: true, shiftKey: true }, "linux")).toBe(
      "Mod+Shift+/",
    );
    expect(comboFromEvent({ code: "Backquote", key: "`", altKey: true }, "mac")).toBe("Alt+`");
    expect(comboFromEvent({ code: "Backslash", key: "|", ctrlKey: true, altKey: true }, "win")).toBe(
      "Mod+Alt+\\",
    );
    expect(comboFromEvent({ code: "Digit1", key: "!", altKey: true, shiftKey: true }, "win")).toBe(
      "Shift+Alt+1",
    );
  });

  it("reads Command as Mod and Control as Ctrl on a Mac, and Ctrl as Mod elsewhere", () => {
    expect(comboFromEvent({ code: "KeyZ", key: "z", metaKey: true, shiftKey: true }, "mac")).toBe(
      "Mod+Shift+Z",
    );
    expect(comboFromEvent({ code: "Space", key: " ", ctrlKey: true }, "mac")).toBe("Ctrl+Space");
    expect(comboFromEvent({ code: "Space", key: " ", ctrlKey: true }, "win")).toBe("Mod+Space");
    expect(comboFromEvent({ code: "KeyF", key: "f", metaKey: true }, "win")).toBe("");
  });

  it("finds no key in a modifier on its own or an unprintable key", () => {
    expect(comboFromEvent({ code: "ShiftLeft", key: "Shift", shiftKey: true }, "win")).toBe("");
    expect(comboFromEvent({ code: "ControlLeft", key: "Control", ctrlKey: true }, "win")).toBe("");
    expect(comboFromEvent({ code: "IntlBackslash", key: "<", ctrlKey: true }, "win")).toBe("");
    expect(comboFromEvent({ code: "Tab", key: "Tab", ctrlKey: true }, "win")).toBe("");
  });

  it("refuses combos that would be typing, and keeps function keys on their own", () => {
    expect(isShortcutCombo("Z")).toBe(false);
    expect(isShortcutCombo("Shift+Z")).toBe(false);
    expect(isShortcutCombo("Space")).toBe(false);
    expect(isShortcutCombo("Mod+Shift")).toBe(false);
    expect(isShortcutCombo("F5")).toBe(true);
    expect(isShortcutCombo("Shift+F12")).toBe(true);
    expect(isShortcutCombo("Alt+Z")).toBe(true);
    expect(isShortcutCombo("Ctrl+Space")).toBe(true);
  });

  it("writes the keys the way each platform writes them", () => {
    expect(comboLabel("Mod+Shift+Z", "mac")).toBe("⌘⇧Z");
    expect(comboLabel("Mod+Shift+Z", "win")).toBe("Ctrl+Shift+Z");
    expect(comboLabel("Ctrl+Space", "mac")).toBe("⌃Space");
    expect(comboLabel("Ctrl+Space", "linux")).toBe("Ctrl+Space");
    expect(comboParts("Mod+Alt+[", "mac")).toEqual(["⌘", "⌥", "["]);
    expect(comboParts("Mod+Alt+[", "win")).toEqual(["Ctrl", "Alt", "["]);
  });
});

describe("platform defaults", () => {
  it("gives Redo Mod+Shift+Z on a Mac and Mod+Y elsewhere, answering to both", () => {
    expect(defaults("mac")["redo"]).toBe("Mod+Shift+Z");
    expect(defaults("win")["redo"]).toBe("Mod+Y");
    expect(activeCombos(rowOf("redo"), defaults("win"), "win")).toEqual(["Mod+Y", "Mod+Shift+Z"]);
    expect(activeCombos(rowOf("redo"), defaults("mac"), "mac")).toEqual(["Mod+Shift+Z", "Mod+Y"]);
  });

  it("keeps the Mac's Control bindings exactly", () => {
    const mac = defaults("mac");
    const win = defaults("win");
    expect(mac["suggestions"]).toBe("Ctrl+Space");
    expect(win["suggestions"]).toBe("Mod+Space");
    expect(activeCombos(rowOf("suggestions"), mac, "mac")).toEqual(["Ctrl+Space", "Alt+`", "Alt+I"]);
    expect(mac["selectLine"]).toBe("Ctrl+L");
    expect(win["selectLine"]).toBe("Alt+L");
    expect(mac["foldAll"]).toBe("Ctrl+Alt+[");
    expect(win["foldAll"]).toBe("Mod+Alt+[");
    expect(mac["fold"]).toBe("Mod+Alt+[");
    expect(win["fold"]).toBe("Mod+Shift+[");
    expect(mac["tabFocus"]).toBe("Shift+Alt+M");
    expect(win["tabFocus"]).toBe("Mod+M");
  });

  it("gives every row a combo no other row holds", () => {
    for (const platform of PLATFORMS) {
      const combos = Object.values(defaults(platform)).filter(Boolean);
      expect(new Set(combos).size, platform).toBe(combos.length);
      for (const row of EDITOR_SHORTCUT_ROWS) {
        expect(defaults(platform)[row.id], `${platform} ${row.id}`).not.toBe("");
      }
    }
  });
});

describe("one combo, one action", () => {
  it("moves a recorded combo off the command that held it", () => {
    const change = assignShortcut(defaults("win"), "rename", "Mod+S", "win");
    expect(change.displaced).toBe("format");
    expect(change.combos["rename"]).toBe("Mod+S");
    expect(change.combos["format"]).toBe("");
  });

  it("takes a command's usual keys back from whoever holds them on reset", () => {
    const moved = assignShortcut(defaults("win"), "search", "F2", "win").combos;
    expect(moved["rename"]).toBe("");
    const back = restoreShortcut(EDITOR_SHORTCUT_ROWS, moved, "rename", "win");
    expect(back.displaced).toBe("search");
    expect(back.combos["rename"]).toBe("F2");
    expect(back.combos["search"]).toBe("");
  });

  it("lets a later row give up a combo an earlier one has when saved overrides collide", () => {
    const combos = resolveShortcuts(EDITOR_SHORTCUT_ROWS, { rename: "Mod+F", search: "Mod+F" }, "win");
    expect(combos["rename"]).toBe("Mod+F");
    expect(combos["search"]).toBe("");
  });

  it("keeps an emptied row empty and ignores a saved combo that is not a shortcut", () => {
    const combos = resolveShortcuts(EDITOR_SHORTCUT_ROWS, { undo: "", redo: "Q", search: 4 }, "win");
    expect(combos["undo"]).toBe("");
    expect(combos["redo"]).toBe("Mod+Y");
    expect(combos["search"]).toBe("Mod+F");
  });

  it("leaves a command with no keys at all once it has none of its own, aliases included", () => {
    const displaced = assignShortcut(defaults("win"), "rename", "Mod+S", "win").combos;
    expect(activeCombos(rowOf("format"), displaced, "win")).toEqual([]);
    const cleared = assignShortcut(defaults("mac"), "redo", "", "mac").combos;
    expect(activeCombos(rowOf("redo"), cleared, "mac")).toEqual([]);
  });

  it("stops an alias working once another command takes it", () => {
    const taken = assignShortcut(defaults("win"), "deleteLine", "Mod+Shift+Z", "win").combos;
    expect(activeCombos(rowOf("redo"), taken, "win")).toEqual(["Mod+Y"]);
  });
});

const comparable = (key: string, platform: ShortcutPlatform) => {
  const parts = key.split(/-(?!$)/);
  const last = parts.pop()!;
  const modifiers = parts.map((part) =>
    /^mod$/i.test(part) ? (platform === "mac" ? "Meta" : "Ctrl") : /^cmd$/i.test(part) ? "Meta" : part,
  );
  const shift = modifiers.includes("Shift") || (last.length === 1 && last !== last.toLowerCase());
  const named = last === "Space" ? " " : last.length === 1 ? last.toLowerCase() : last;
  return [...new Set([...modifiers.filter((m) => m !== "Shift"), ...(shift ? ["Shift"] : [])])]
    .sort()
    .concat(named)
    .join("-");
};

const keySet = (bindings: readonly KeyBinding[], platform: ShortcutPlatform) => {
  const keys = new Set<string>();
  for (const binding of bindings) {
    const name = binding[platform] ?? binding.key;
    if (!name) {
      continue;
    }
    const scopes = (binding.scope ?? "editor").split(" ");
    for (const scope of scopes) {
      if (binding.run) {
        keys.add(`${scope}|${comparable(name, platform)}`);
      }
      if (binding.shift) {
        keys.add(`${scope}|${comparable(`Shift-${name}`, platform)}`);
      }
    }
  }
  return keys;
};

const stub = () => true;

const BASE_KEYMAPS: readonly KeyBinding[] = [
  indentWithTab,
  ...defaultKeymap,
  ...searchKeymap,
  ...historyKeymap,
  ...completionKeymap,
  ...lintKeymap,
  ...foldKeymap,
  ...closeBracketsKeymap,
  { key: "Enter", run: stub },
  { key: "Tab", run: stub },
  { key: "F12", run: stub },
  { key: "Shift-F12", run: stub },
  { key: "Escape", run: stub },
  { key: "F2", run: stub },
  { key: "Shift-Alt-f", run: stub },
  { key: "Mod-s", run: stub },
  { key: "PageUp", run: stub },
  { key: "PageDown", run: stub },
  { key: "Mod-Shift-Space", run: stub },
  { key: "Mod-Shift-ArrowUp", run: stub },
  { key: "Mod-Shift-ArrowDown", run: stub },
  { key: "Mod-f", run: stub, scope: "editor search-panel" },
  { key: "Escape", run: stub, scope: "editor search-panel" },
  { key: "Mod-g", run: stub, scope: "editor gotoline-panel" },
  { key: "Escape", run: stub, scope: "editor gotoline-panel" },
];

const SUPPLIED: ShortcutCommands = {
  newLineByRules: stub,
  closeGotoLine: stub,
  previousBeat: stub,
  nextBeat: stub,
};

const generated = (platform: ShortcutPlatform) => {
  const state: EditorShortcutsState = {
    platform,
    combos: defaults(platform),
    commands: { ...EDITOR_SHORTCUT_COMMANDS, ...SUPPLIED },
  };
  return (["highest", "high", "default"] as const).flatMap((precedence) =>
    shortcutKeyBindings(state, precedence),
  );
};

describe("the generated keymaps", () => {
  it.each(PLATFORMS)(
    "bind every key the base keymaps bound on %s, but Next match's Mod+G that Go to line holds",
    (platform) => {
      const expected = keySet(BASE_KEYMAPS, platform);
      const actual = keySet(generated(platform), platform);
      const missing = [...expected].filter((key) => !actual.has(key));
      expect(missing).toEqual([`search-panel|${platform === "mac" ? "Meta" : "Ctrl"}-g`]);
    },
  );

  it("turns a combo into the key name CodeMirror reads", () => {
    expect(codeMirrorKey("Mod+Shift+[", "win")).toBe("Shift-Ctrl-[");
    expect(codeMirrorKey("Mod+Shift+[", "mac")).toBe("Shift-Meta-[");
    expect(codeMirrorKey("Ctrl+Space", "mac")).toBe("Ctrl-Space");
    expect(codeMirrorKey("Ctrl+Space", "win")).toBe("Ctrl-Space");
    expect(codeMirrorKey("Alt+Up", "linux")).toBe("Alt-ArrowUp");
    expect(codeMirrorKey("Shift+Alt+A", "win")).toBe("Shift-Alt-a");
  });

  it("runs Format on Mod+Shift+X once the table gives it that combo, and not on its old keys", () => {
    const format = vi.fn(() => true);
    const combos = assignShortcut(defaults("linux"), "format", "Mod+Shift+X", "linux").combos;
    const view = mountEditor({ combos, platform: "linux", commands: { format } });
    press(view, { key: "s", code: "KeyS", keyCode: 83, ctrlKey: true });
    expect(format).not.toHaveBeenCalled();
    const event = press(view, { key: "X", code: "KeyX", keyCode: 88, ctrlKey: true, shiftKey: true });
    expect(format).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("rebuilds the keymaps when the combos change", () => {
    const search = vi.fn(() => true);
    const view = mountEditor({ platform: "linux", commands: { search } });
    press(view, { key: "f", code: "KeyF", keyCode: 70, ctrlKey: true });
    expect(search).toHaveBeenCalledTimes(1);
    setEditorShortcuts(view, assignShortcut(defaults("linux"), "search", "Mod+Shift+F", "linux").combos);
    press(view, { key: "f", code: "KeyF", keyCode: 70, ctrlKey: true });
    expect(search).toHaveBeenCalledTimes(1);
    press(view, { key: "F", code: "KeyF", keyCode: 70, ctrlKey: true, shiftKey: true });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("answers the context menu's labels from the current combos", () => {
    const view = mountEditor({
      platform: "win",
      combos: assignShortcut(defaults("win"), "rename", "Mod+S", "win").combos,
    });
    expect(shortcutLabelFor(view.state, "rename")).toBe("Ctrl+S");
    expect(shortcutLabelFor(view.state, "format")).toBeUndefined();
    expect(shortcutLabelFor(view.state, "references")).toBe("Shift+F12");
    expect(shortcutLabelFor(view.state, "copy")).toBe("Ctrl+C");
  });

  it("binds no key, aliases included, for a command left without a shortcut", () => {
    const format = vi.fn(() => true);
    const redo = vi.fn(() => true);
    const displaced = assignShortcut(defaults("linux"), "rename", "Mod+S", "linux").combos;
    const combos = assignShortcut(displaced, "redo", "", "linux").combos;
    const view = mountEditor({ combos, platform: "linux", commands: { format, redo } });
    press(view, { key: "F", code: "KeyF", keyCode: 70, shiftKey: true, altKey: true });
    press(view, { key: "s", code: "KeyS", keyCode: 83, ctrlKey: true });
    press(view, { key: "y", code: "KeyY", keyCode: 89, ctrlKey: true });
    press(view, { key: "Z", code: "KeyZ", keyCode: 90, ctrlKey: true, shiftKey: true });
    expect(format).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });
});
