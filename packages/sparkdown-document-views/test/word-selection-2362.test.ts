import { ensureSyntaxTree, forceParsing } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  destroyEditors,
  doubleClick,
  installRangeRects,
  leftQuarterOf,
  liveEditor,
  offset,
  pressKey,
  pressSelectNext,
  rightQuarterOf,
  type Point,
} from "./helpers/wordSelectionEditor";
import { settleParse } from "./helpers/parseSettle";

installRangeRects();

afterEach(destroyEditors);

type Span = [from: number, to: number];
const MEASURED: {
  lines: string[];
  doubleClick: (Span | null)[][][];
  block:{ line: number; ch: number; side: number; selection: Span; selected: string }[];
} = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "vscodeWordSelection2229.json"), "utf8"),
);

const parsedEditor = (lines: string[]) => {
  const view = liveEditor(lines);
  settleParse(view);
  return view;
};

const doubleClickAt = (view: EditorView, lines: string[], [line, ch]: Point, side: number, options = {}) => {
  const at = offset(lines, [line, ch]);
  const { main } = doubleClick(view, side ? rightQuarterOf(at) : leftQuarterOf(at), undefined, options);
  return view.state.sliceDoc(main.from, main.to);
};

describe("double-click just inside a bracket pair or a quoted string selects its contents as VS Code does (#2232)", () => {
  const lines = ["{mia@night}", 'x = "hi there"', "a(b (c d( ((e", "a)b )c d) ))e"];

  it.each([
    { at: [0, 0] as Point, side: 1, where: "right half of {", selected: "mia@night" },
    { at: [0, 10] as Point, side: 0, where: "left half of }", selected: "mia@night" },
    { at: [1, 4] as Point, side: 1, where: 'right half of the opening "', selected: "hi there" },
    { at: [1, 13] as Point, side: 0, where: 'left half of the closing "', selected: "hi there" },
  ])("selects the contents on the $where", ({ at, side, selected }) => {
    expect(doubleClickAt(parsedEditor(lines), lines, at, side)).toBe(selected);
  });

  it.each([
    { at: [2, 1] as Point, side: 1, where: "right half of the first (", selected: "b" },
    { at: [3, 11] as Point, side: 0, where: "left half of the last )", selected: "))" },
  ])("selects the word on the $where of display text, whose string scope VS Code leaves out of bracket pairs", ({ at, side, selected }) => {
    expect(doubleClickAt(parsedEditor(lines), lines, at, side)).toBe(selected);
  });

  it("selects the contents VS Code selected at every measured block position", () => {
    const view = parsedEditor(MEASURED.lines);
    const doc = MEASURED.lines.join("\n");
    const label = ({ line, ch, side }: (typeof MEASURED.block)[number]) => `${line}:${ch}${side ? " right" : " left"}`;
    const actual = MEASURED.block.map((entry) => {
      const at = offset(MEASURED.lines, [entry.line, entry.ch]);
      const { main } = doubleClick(view, entry.side ? rightQuarterOf(at) : leftQuarterOf(at));
      return `${label(entry)} -> ${JSON.stringify(doc.slice(main.from, main.to))}`;
    });
    expect(actual).toEqual(MEASURED.block.map((entry) => `${label(entry)} -> ${JSON.stringify(entry.selected)}`));
  });

  it.each([
    { at: [1, 0] as Point, side: 0 },
    { at: [1, 0] as Point, side: 1 },
    { at: [1, 1] as Point, side: 0 },
    { at: [1, 1] as Point, side: 1 },
  ])("selects the word VS Code selected, not the enclosing block, in the leading whitespace at $at side $side", ({ at: [line, ch], side }) => {
    const [from, to] = MEASURED.doubleClick[line]![ch]![side]!;
    expect(doubleClickAt(parsedEditor(MEASURED.lines), MEASURED.lines, [line, ch], side)).toBe(MEASURED.lines[line]!.slice(from, to));
  });

  it.each([
    { text: "{mia@night", where: "an unclosed {" },
    { text: "{mia@night]", where: "a { closed by ]" },
    { text: "{mia@night)", where: "a { closed by )" },
  ])("selects the word right after $where", ({ text }) => {
    expect(doubleClickAt(parsedEditor([text]), [text], [0, 0], 1)).toBe("mia");
  });

  it("selects a string's contents on a parsed line while the rest of a long document is still unparsed", () => {
    const long = ['x = "hi there"', ...Array.from({ length: 20000 }, (_, i) => `Display text number ${i}`)];
    const view = liveEditor(long);
    forceParsing(view, long[0]!.length, 5000);
    expect(ensureSyntaxTree(view.state, view.state.doc.length, 0)).toBeNull();
    expect(doubleClickAt(view, long, [0, 4], 1)).toBe("hi there");
  });

  it("selects the word right after the opening quote of an unterminated string", () => {
    expect(doubleClickAt(parsedEditor(['x = "hi there']), ['x = "hi there'], [0, 4], 1)).toBe("hi");
  });

  it("extends from the caret by a word, not to the contents, with Shift held", () => {
    expect(doubleClickAt(parsedEditor(["{mia@night}"]), ["{mia@night}"], [0, 1], 0, { caret: 0, shiftKey: true })).toBe("{mia");
  });

  it("adds the word, not the contents, as a new range with the add-cursor modifier held", () => {
    const view = parsedEditor(["{mia@night}"]);
    doubleClickAt(view, ["{mia@night}"], [0, 1], 0, { caret: 11, addsRange: true });
    expect(view.state.selection.ranges.map((range) => view.state.sliceDoc(range.from, range.to))).toEqual(["mia", ""]);
  });
});

describe("Ctrl+D keeps VS Code's session rules (#2233)", () => {
  const lines = ["em …em—dash em", "Name name NAME", "item items item"];
  type Step = "select4" | "shiftRight" | "right" | "ctrlD";

  const run = (view: EditorView, caret: Point, steps: Step[]) => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: lines.join("\n") }, selection: { anchor: offset(lines, caret) } });
    for (const step of steps) {
      if (step === "select4") view.dispatch({ selection: { anchor: offset(lines, caret), head: offset(lines, caret) + 4 }, userEvent: "select" });
      else if (step === "shiftRight") pressKey(view, "ArrowRight", { shiftKey: true });
      else if (step === "right") pressKey(view, "ArrowRight");
      else pressSelectNext(view);
    }
    view.dispatch(view.state.replaceSelection("X"));
    return view.state.doc.toString().split("\n");
  };

  it.each([
    { name: "1a", caret: [1, 5] as Point, steps: ["select4", "ctrlD"] as Step[], after: ["Name X X", "item items item"] },
    { name: "1b", caret: [1, 5] as Point, steps: ["select4", "ctrlD", "ctrlD"] as Step[], after: ["X X X", "item items item"] },
    { name: "1c", caret: [2, 0] as Point, steps: ["select4", "ctrlD"] as Step[], after: ["Name name NAME", "X Xs item"] },
    { name: "1d", caret: [2, 0] as Point, steps: ["select4", "ctrlD", "ctrlD"] as Step[], after: ["Name name NAME", "X Xs X"] },
    { name: "2a", caret: [1, 6] as Point, steps: ["ctrlD"] as Step[], after: ["Name X NAME", "item items item"] },
    { name: "2b", caret: [1, 6] as Point, steps: ["ctrlD", "ctrlD"] as Step[], after: ["Name X NAME", "item items item"] },
    { name: "2c", caret: [2, 1] as Point, steps: ["ctrlD", "ctrlD"] as Step[], after: ["Name name NAME", "X items X"] },
    { name: "2d", caret: [2, 1] as Point, steps: ["ctrlD", "ctrlD", "ctrlD"] as Step[], after: ["Name name NAME", "X items X"] },
    { name: "3a", caret: [1, 6] as Point, steps: ["ctrlD", "shiftRight", "ctrlD"] as Step[], after: ["XXNAME", "item items item"] },
    { name: "3b", caret: [1, 6] as Point, steps: ["ctrlD", "shiftRight", "ctrlD", "ctrlD"] as Step[], after: ["XXNAME", "item items item"] },
    { name: "3c", caret: [2, 1] as Point, steps: ["ctrlD", "right", "right", "right", "ctrlD", "ctrlD"] as Step[], after: ["Name name NAME", "item X item"] },
  ])("case $name gives VS Code's lines", ({ caret, steps, after }) => {
    expect(run(liveEditor(lines), caret, steps)).toEqual([lines[0], ...after]);
  });

  it("ends a session that began at a caret when the editor loses focus, so the next press searches the selection case-insensitively", async () => {
    const focusSettles = () => new Promise((resolve) => setTimeout(resolve, 50));
    const view = liveEditor(lines);
    view.focus();
    await focusSettles();
    view.dispatch({ selection: { anchor: offset(lines, [1, 6]) } });
    pressSelectNext(view);
    view.contentDOM.blur();
    await focusSettles();
    expect(view.hasFocus).toBe(false);
    view.focus();
    await focusSettles();
    pressSelectNext(view);
    view.dispatch(view.state.replaceSelection("X"));
    expect(view.state.doc.toString().split("\n")[1]).toBe("Name X X");
  });
});
