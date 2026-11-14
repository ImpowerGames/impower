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
  plainEditor,
  pressSelectNext,
  rightQuarterOf,
  type Point,
} from "./helpers/wordSelectionEditor";

installRangeRects();

type Span = [from: number, to: number];
type Drag = { start: Point; target: Point; head: Point; selected: number };
type Next = { caret: Point; after: string[] };
const MEASURED: {
  source: string;
  lines: string[];
  doubleClick: [Span | null, Span | null][][];
  block: { line: number; ch: number; side: number; selection: Span; selected: string }[];
  ctrlD: Span[][];
  drag: { lines: string[]; cases: Drag[] };
  next: { lines: string[]; cases: Next[] };
} = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "vscodeWordSelection2229.json"), "utf8"),
);

afterEach(destroyEditors);

const boundaryOn = (lines: string[], [line, pos]: Point) =>
  pos < lines[line]!.length ? leftQuarterOf(offset(lines, [line, pos])) : rightQuarterOf(offset(lines, [line, pos]) - 1);

const quoted = (lines: string[], line: number, [from, to]: Span) => JSON.stringify(lines[line]!.slice(from, to));
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "`": "`" };

describe("double-click selects the word VS Code selects (#2229)", () => {
  it("leaves out only the positions where VS Code selected the contents of a bracket pair or quoted string", () => {
    const doc = MEASURED.lines.join("\n");
    const skipped = MEASURED.doubleClick.flatMap((cells, line) =>
      cells.flatMap((pair, ch) => pair.flatMap((span, side) => (span ? [] : [`${line}:${ch}:${side}`]))),
    );
    expect(skipped).toEqual(MEASURED.block.map(({ line, ch, side }) => `${line}:${ch}:${side}`));
    for (const { selection: [from, to], selected } of MEASURED.block) {
      expect(doc.slice(from, to)).toBe(selected);
      expect(PAIRS[doc[from - 1]!], JSON.stringify(selected)).toBe(doc[to]);
    }
  });

  it("selects VS Code's range at every other position of every line", () => {
    const view = liveEditor(MEASURED.lines);
    const actual: string[] = [];
    const expected: string[] = [];
    MEASURED.lines.forEach((text, line) => {
      for (let ch = 0; ch < text.length; ch++) {
        MEASURED.doubleClick[line]![ch]!.forEach((span, side) => {
          const pos = ch + side;
          if (!span) return;
          const from = offset(MEASURED.lines, [line, 0]);
          const { main } = doubleClick(view, side ? rightQuarterOf(from + ch) : leftQuarterOf(from + ch));
          const label = `${line}:${ch}${side ? " right" : " left"} ${JSON.stringify(`${text.slice(0, pos)}|${text.slice(pos)}`)}`;
          actual.push(`${label} -> ${quoted(MEASURED.lines, line, [main.from - from, main.to - from])}`);
          expected.push(`${label} -> ${quoted(MEASURED.lines, line, span)}`);
        });
      }
    });
    expect(actual).toEqual(expected);
  });

  it("extends by VS Code's words while the double-click drags", () => {
    const { lines, cases } = MEASURED.drag;
    const view = liveEditor(lines);
    const actual = cases.map(({ start, target }) => {
      const { main } = doubleClick(view, leftQuarterOf(offset(lines, start)), boundaryOn(lines, target));
      return `${start} to ${target}: head ${main.head} selected ${main.to - main.from}`;
    });
    const expected = cases.map(({ start, target, head, selected }) => `${start} to ${target}: head ${offset(lines, head)} selected ${selected}`);
    expect(actual).toEqual(expected);
  });

  it.each([
    { caret: 0, click: 5, dragTo: undefined, selected: "one two" },
    { caret: 0, click: 5, dragTo: 1, selected: "one" },
    { caret: 13, click: 5, dragTo: undefined, selected: "two three" },
    { caret: 13, click: 5, dragTo: 10, selected: "three" },
  ])("with Shift held, extends from the caret at $caret to the word under the pointer as CodeMirror's own double-click does ($click, dragged to $dragTo)", ({ caret, click, dragTo, selected }) => {
    const lines = ["one two three"];
    const shiftDoubleClick = (view: EditorView) => {
      const { main } = doubleClick(view, leftQuarterOf(click), dragTo === undefined ? undefined : leftQuarterOf(dragTo), { caret, shiftKey: true });
      return { anchor: main.anchor, head: main.head, text: view.state.sliceDoc(main.from, main.to) };
    };
    const editor = shiftDoubleClick(liveEditor(lines));
    expect(editor.text).toBe(selected);
    expect(editor).toEqual(shiftDoubleClick(plainEditor(lines)));
  });
});

describe("select next occurrence selects the word VS Code selects (#2229)", () => {
  it("selects VS Code's word, or nothing, from every caret position of every line", () => {
    const view = liveEditor(MEASURED.lines);
    const actual: string[] = [];
    const expected: string[] = [];
    MEASURED.lines.forEach((text, line) => {
      const from = offset(MEASURED.lines, [line, 0]);
      for (let ch = 0; ch <= text.length; ch++) {
        view.dispatch({ selection: { anchor: from + ch } });
        pressSelectNext(view);
        const { main } = view.state.selection;
        const label = `${line}:${ch} ${JSON.stringify(`${text.slice(0, ch)}|${text.slice(ch)}`)}`;
        actual.push(`${label} -> ${quoted(MEASURED.lines, line, [main.from - from, main.to - from])}`);
        expected.push(`${label} -> ${quoted(MEASURED.lines, line, MEASURED.ctrlD[line]![ch]!)}`);
      }
    });
    expect(actual).toEqual(expected);
  });

  it("adds the next whole-word copy VS Code adds on the second press", () => {
    const { lines, cases } = MEASURED.next;
    const view = liveEditor(lines);
    const doc = lines.join("\n");
    const actual = cases.map(({ caret }) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc }, selection: { anchor: offset(lines, caret) } });
      pressSelectNext(view);
      pressSelectNext(view);
      view.dispatch(view.state.replaceSelection("X"));
      return `${caret}: ${JSON.stringify(view.state.doc.toString().split("\n"))}`;
    });
    expect(actual).toEqual(cases.map(({ caret, after }) => `${caret}: ${JSON.stringify(after)}`));
  });
});
