import { EditorView } from "@codemirror/view";
import { shortcutPlatform, type LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../src/modules/script-editor/utils/createEditorView";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

type Span = [from: number, to: number];
type Point = [line: number, ch: number];
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

const PX = 20;
const views: EditorView[] = [];

const liveEditor = (lines: string[]) => {
  const parent = document.body.appendChild(document.createElement("div"));
  const worker = Object.assign(new EventTarget(), {
    postMessage: () => {},
  }) as unknown as Worker;
  const [view] = createEditorView(parent, {
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
    textDocument: { uri: "file:///main.sd", version: 0, text: lines.join("\n") },
    top: 0,
    bottom: 0,
  } as never) as unknown as [EditorView];
  const posAt = ({ x }: { x: number }) => Math.round(x / PX);
  vi.spyOn(view, "posAtCoords").mockImplementation(posAt as never);
  vi.spyOn(view, "posAndSideAtCoords").mockImplementation(((coords: { x: number }) => ({
    pos: posAt(coords),
    assoc: coords.x < posAt(coords) * PX ? -1 : 1,
  })) as never);
  views.push(view);
  return view;
};

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const offset = (lines: string[], [line, ch]: Point) =>
  lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0) + ch;

const leftQuarterOf = (ch: number) => ch * PX + PX / 4;
const rightQuarterOf = (ch: number) => (ch + 1) * PX - PX / 4;
const boundaryOn = (lines: string[], [line, pos]: Point) =>
  pos < lines[line]!.length ? leftQuarterOf(offset(lines, [line, pos])) : rightQuarterOf(offset(lines, [line, pos]) - 1);

const mouse = (view: EditorView, type: string, x: number, detail: number) => {
  const init = { bubbles: true, cancelable: true, button: 0, buttons: type === "mouseup" ? 0 : 1, detail, clientX: x, clientY: 1 };
  (type === "mousedown" ? view.contentDOM : view.contentDOM.ownerDocument).dispatchEvent(new MouseEvent(type, init));
};

const doubleClick = (view: EditorView, x: number, dragTo?: number) => {
  view.dispatch({ selection: { anchor: 0 } });
  mouse(view, "mousedown", x, 1);
  mouse(view, "mouseup", x, 1);
  mouse(view, "mousedown", x, 2);
  if (dragTo !== undefined) mouse(view, "mousemove", dragTo, 2);
  mouse(view, "mouseup", dragTo ?? x, 2);
  return view.state.selection;
};

const pressSelectNext = (view: EditorView) =>
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "d", ...(shortcutPlatform() === "mac" ? { metaKey: true } : { ctrlKey: true }) }),
  );

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
