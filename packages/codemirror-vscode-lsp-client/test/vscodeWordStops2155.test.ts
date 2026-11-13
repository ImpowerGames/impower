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
type Range = [anchor: number, head: number];
type SelectionCase = { name: string; from: Range[]; keys: (Kind | "backspace")[]; selections: Range[]; text?: string };
const MEASURED: { lines: string[]; source: string; selections: { lines: string[]; cases: SelectionCase[] } } & Record<
  Kind,
  Stop[][]
> = JSON.parse(
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

const mount = (language: string, platform: ShortcutPlatform, doc = DOC) => {
  const view = new EditorView({
    parent: document.body.appendChild(document.createElement("div")),
    state: EditorState.create({
      doc,
      extensions: [
        EditorState.languageData.of(() => [convertConfigToLanguageData(configOf(language))]),
        EditorState.allowMultipleSelections.of(true),
        editorShortcuts({ platform }),
      ],
    }),
  });
  views.push(view);
  return view;
};

const press = (view: EditorView, init: KeyboardEventInit) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

const editOf = (after: string) => {
  let from = 0;
  while (from < after.length && after[from] === DOC[from]) from++;
  let tail = 0;
  while (tail < after.length - from && after[after.length - 1 - tail] === DOC[DOC.length - 1 - tail]) tail++;
  return { from, removed: DOC.slice(from, DOC.length - tail), inserted: after.slice(from, after.length - tail) };
};

const stopFrom = (view: EditorView, kind: Kind, platform: ShortcutPlatform, pos: number) => {
  view.dispatch({
    changes: view.state.doc.toString() === DOC ? undefined : { from: 0, to: view.state.doc.length, insert: DOC },
    selection: EditorSelection.cursor(pos),
  });
  press(view, KEYS[platform][kind]);
  const { head, anchor } = view.state.selection.main;
  return { head, selected: Math.abs(head - anchor), edit: editOf(view.state.doc.toString()) };
};

const expectedFrom = (kind: Kind, pos: number, stop: Stop) => {
  const offset = offsetOf(stop);
  if (kind === "deleteLeft") return { head: offset, selected: 0, edit: editOf(DOC.slice(0, offset) + DOC.slice(pos)) };
  if (kind === "deleteRight") return { head: pos, selected: 0, edit: editOf(DOC.slice(0, pos) + DOC.slice(offset)) };
  return { head: offset, selected: stop[2] ?? 0, edit: editOf(DOC) };
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
        row.map((stop, ch) => `${label(lineFrom(line) + ch)} -> ${JSON.stringify(expectedFrom(kind, lineFrom(line) + ch, stop))}`),
      );
      expect(actual).toEqual(expected);
    });
  });

  it("moves from before the @ of @hovered to the end of hovered, as the ticket reports VS Code does", () => {
    const view = mount(language, "win");
    const at = DOC.indexOf("@hovered");
    expect(stopFrom(view, "right", "win", at).head).toBe(at + "@hovered".length);
  });

  it("erases the text between the caret and the stop", () => {
    const view = mount(language, "win");
    const word = DOC.indexOf("hovered");
    expect(stopFrom(view, "deleteLeft", "win", word + "hovered".length).edit).toEqual({ from: word, removed: "hovered", inserted: "" });
    expect(stopFrom(view, "deleteRight", "win", word).edit).toEqual({ from: word, removed: "hovered", inserted: "" });
  });

  describe.each(PLATFORMS)("with a selection or several carets on %s", (platform) => {
    const { lines, cases } = MEASURED.selections;
    it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
      const doc = lines.join("\n");
      const view = mount(language, platform, doc);
      view.dispatch({
        selection: EditorSelection.create(c.from.map(([anchor, head]) => EditorSelection.range(anchor, head))),
      });
      for (const key of c.keys) press(view, key === "backspace" ? { key: "Backspace" } : KEYS[platform][key]);
      expect(view.state.selection.ranges.map((range) => [range.anchor, range.head])).toEqual(c.selections);
      expect(view.state.doc.toString()).toBe(c.text ?? doc);
    });
  });
});
