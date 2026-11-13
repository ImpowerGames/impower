import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { convertConfigToLanguageData } from "../../codemirror-vscode-language/src/utils/convertConfigToLanguageData";
import type { ShortcutPlatform } from "../src/shortcutCombo";
import { editorShortcuts } from "../src/shortcuts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const LANGUAGES = ["sparkdown", "sparkdown-luau"] as const;
const configOf = (language: string) =>
  JSON.parse(readFileSync(join(ROOT, "packages", "sparkdown", "language", `${language}.language-config.json`), "utf8"));

type Stop = [line: number, ch: number, selected?: number];
type Kind = "right" | "left" | "selectRight" | "selectLeft" | "deleteLeft" | "deleteRight";
const MEASURED: { lines: string[]; source: string } & Record<Kind, Stop[][]> = JSON.parse(
  readFileSync(join(HERE, "fixtures", "vscodeWordStops2155.json"), "utf8"),
);
const DOC = MEASURED.lines.join("\n");

const KEYS: Record<ShortcutPlatform, Record<Kind, KeyboardEventInit>> = {
  win: {
    right: { key: "ArrowRight", ctrlKey: true },
    left: { key: "ArrowLeft", ctrlKey: true },
    selectRight: { key: "ArrowRight", ctrlKey: true, shiftKey: true },
    selectLeft: { key: "ArrowLeft", ctrlKey: true, shiftKey: true },
    deleteLeft: { key: "Backspace", ctrlKey: true },
    deleteRight: { key: "Delete", ctrlKey: true },
  },
  linux: {
    right: { key: "ArrowRight", ctrlKey: true },
    left: { key: "ArrowLeft", ctrlKey: true },
    selectRight: { key: "ArrowRight", ctrlKey: true, shiftKey: true },
    selectLeft: { key: "ArrowLeft", ctrlKey: true, shiftKey: true },
    deleteLeft: { key: "Backspace", ctrlKey: true },
    deleteRight: { key: "Delete", ctrlKey: true },
  },
  mac: {
    right: { key: "ArrowRight", altKey: true },
    left: { key: "ArrowLeft", altKey: true },
    selectRight: { key: "ArrowRight", altKey: true, shiftKey: true },
    selectLeft: { key: "ArrowLeft", altKey: true, shiftKey: true },
    deleteLeft: { key: "Backspace", altKey: true },
    deleteRight: { key: "Delete", altKey: true },
  },
};

const KINDS = Object.keys(KEYS.win) as Kind[];
const PLATFORMS = Object.keys(KEYS) as ShortcutPlatform[];

const lineFrom = (line: number) => MEASURED.lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0);
const offsetOf = ([line, ch]: Stop) => lineFrom(line) + ch;
const label = (pos: number) => {
  const line = DOC.slice(0, pos).split("\n").length - 1;
  const ch = pos - lineFrom(line);
  const text = MEASURED.lines[line]!;
  return `${line}:${ch} ${JSON.stringify(`${text.slice(0, ch)}|${text.slice(ch)}`)}`;
};

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = "";
});

const mount = (language: string, platform: ShortcutPlatform) => {
  const view = new EditorView({
    parent: document.body.appendChild(document.createElement("div")),
    state: EditorState.create({
      doc: DOC,
      extensions: [
        EditorState.languageData.of(() => [convertConfigToLanguageData(configOf(language))]),
        editorShortcuts({ platform }),
      ],
    }),
  });
  views.push(view);
  return view;
};

const press = (view: EditorView, init: KeyboardEventInit) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

const stopFrom = (view: EditorView, kind: Kind, platform: ShortcutPlatform, pos: number) => {
  view.dispatch({
    changes: view.state.doc.toString() === DOC ? undefined : { from: 0, to: view.state.doc.length, insert: DOC },
    selection: EditorSelection.cursor(pos),
  });
  press(view, KEYS[platform][kind]);
  const { head, anchor } = view.state.selection.main;
  if (kind === "deleteRight") return pos + (DOC.length - view.state.doc.length);
  if (kind.startsWith("select")) return [head, Math.abs(head - anchor)];
  return head;
};

const expectedFrom = (kind: Kind, stop: Stop) => {
  const offset = offsetOf(stop);
  if (kind.startsWith("select")) return [offset, stop[2]];
  return offset;
};

const positions = () => [...Array(DOC.length + 1).keys()];

describe.each(LANGUAGES)("the web editor's word keys stop where VS Code's do in %s (#2155)", (language) => {
  it("holds a measured VS Code stop for every position of every line", () => {
    for (const kind of KINDS) {
      expect(MEASURED[kind].map((row) => row.length)).toEqual(MEASURED.lines.map((text) => text.length + 1));
    }
  });

  describe.each(PLATFORMS)("on %s", (platform) => {
    it.each(KINDS)("%s", (kind) => {
      const view = mount(language, platform);
      const actual = positions().map((pos) => `${label(pos)} -> ${JSON.stringify(stopFrom(view, kind, platform, pos))}`);
      const expected = MEASURED[kind].flatMap((row, line) =>
        row.map((stop, ch) => `${label(lineFrom(line) + ch)} -> ${JSON.stringify(expectedFrom(kind, stop))}`),
      );
      expect(actual).toEqual(expected);
    });
  });

  it("moves from before the @ of @hovered to the end of hovered, as the ticket reports VS Code does", () => {
    const view = mount(language, "win");
    const at = DOC.indexOf("@hovered");
    expect(stopFrom(view, "right", "win", at)).toBe(at + "@hovered".length);
  });
});
