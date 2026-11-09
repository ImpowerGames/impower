import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { coarsePointer } from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  breakpointsChanged,
  getBreakpointLineNumbers,
  setBreakpointStates,
} from "../src/cm-breakpoints/breakpoints";
import EDITOR_EXTENSIONS from "../src/modules/script-editor/constants/EDITOR_EXTENSIONS";
import {
  scriptMode,
  setScriptMode,
} from "../src/modules/script-editor/utils/extensions/scriptMode";

const script = [
  "scene start",
  "  HERO:",
  "    The first line.",
  "",
  "    The second line.",
  "end",
].join("\n");

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

let view: EditorView | undefined;

const mount = (
  options: { coarse?: boolean; mode?: "reading" | "editing" | null } = {},
) => {
  const changes: number[][] = [];
  view = new EditorView({
    state: EditorState.create({
      doc: script,
      extensions: [
        EDITOR_EXTENSIONS,
        scriptMode(options.mode ?? null),
        coarsePointer.of(Boolean(options.coarse)),
        EditorView.updateListener.of((update) => {
          if (breakpointsChanged(update)) {
            changes.push(getBreakpointLineNumbers(update.view));
          }
        }),
      ],
    }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  return { view, changes };
};

const gutterCell = (v: EditorView) => {
  const cell = v.dom.querySelector(
    ".cm-breakpoint-gutter .cm-gutterElement:not([style*='visibility'])",
  );
  expect(cell).not.toBeNull();
  return cell!;
};

const pressGutterAt = (v: EditorView, lineNumber: number) => {
  const block = v.lineBlockAt(v.state.doc.line(lineNumber).from);
  vi.spyOn(v, "lineBlockAtHeight").mockReturnValue(block);
  gutterCell(v).dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
  );
};

const markers = (v: EditorView) =>
  Array.from(v.dom.querySelectorAll(".cm-breakpoint-gutter .cm-breakpoint"));

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("the script editor's breakpoint gutter", () => {
  it("toggles a dot on the pressed line and reports the lines that hold one", () => {
    const { view, changes } = mount();
    pressGutterAt(view, 3);
    expect(getBreakpointLineNumbers(view)).toEqual([3]);
    expect(changes).toEqual([[3]]);
    expect(markers(view)).toHaveLength(1);
    pressGutterAt(view, 3);
    expect(getBreakpointLineNumbers(view)).toEqual([]);
    expect(changes).toEqual([[3], []]);
  });

  it("moves a dot with its line when text is edited above it", () => {
    const { view } = mount();
    pressGutterAt(view, 5);
    view.dispatch({ changes: { from: 0, insert: "store mood = 0\n\n" } });
    expect(getBreakpointLineNumbers(view)).toEqual([7]);
    expect(view.state.doc.line(7).text).toBe("    The second line.");
  });

  it("moves a dot to the line the debugger verified, and draws an unplaceable one hollow with its reason", () => {
    const { view } = mount();
    pressGutterAt(view, 4);
    pressGutterAt(view, 6);
    setBreakpointStates(view, [
      { line: 5, verified: true },
      { line: 6, verified: false },
    ]);
    expect(getBreakpointLineNumbers(view)).toEqual([5, 6]);
    const hollow = view.dom.querySelectorAll(".cm-breakpoint-unverified");
    expect(hollow).toHaveLength(1);
    expect(hollow[0]!.getAttribute("title")).toBe("No statement to stop at here.");
    expect(markers(view)).toHaveLength(2);
  });

  it("shows its column while the script holds a breakpoint, even with line numbers off", () => {
    const { view } = mount();
    expect(view.dom.classList.contains("cm-has-breakpoints")).toBe(false);
    pressGutterAt(view, 3);
    expect(view.dom.classList.contains("cm-has-breakpoints")).toBe(true);
  });

  it("offers a fine pointer its column before any breakpoint, with line numbers off", () => {
    const { view, changes } = mount();
    expect(view.dom.classList.contains("cm-line-numbers")).toBe(false);
    const gutter = view.dom.querySelector(".cm-breakpoint-gutter")!;
    expect(getComputedStyle(gutter).width).toBe("14px");
    pressGutterAt(view, 3);
    expect(changes).toEqual([[3]]);
    expect(markers(view)).toHaveLength(1);
    expect(getComputedStyle(gutter).width).toBe("14px");
  });

  it("keeps a touch editor's column hidden until the script has a breakpoint", () => {
    const { view } = mount({ coarse: true, mode: "editing" });
    const gutter = view.dom.querySelector(".cm-breakpoint-gutter")!;
    expect(getComputedStyle(gutter).width).toBe("0px");
    pressGutterAt(view, 3);
    expect(getComputedStyle(gutter).width).toBe("44px");
  });

  it("widens its target for a coarse pointer", () => {
    expect(mount({ coarse: true }).view.dom.classList).toContain(
      "cm-breakpoints-coarse",
    );
    view?.destroy();
    expect(mount().view.dom.classList).not.toContain("cm-breakpoints-coarse");
  });

  it("takes a press only in editing mode when the script has a mode", () => {
    const { view, changes } = mount({ coarse: true, mode: "reading" });
    pressGutterAt(view, 3);
    expect(getBreakpointLineNumbers(view)).toEqual([]);
    expect(changes).toEqual([]);
    view.dispatch({ effects: setScriptMode.of("editing") });
    pressGutterAt(view, 3);
    expect(getBreakpointLineNumbers(view)).toEqual([3]);
  });

  it("keeps a touch that starts on it from the editor's own touch handling", () => {
    const { view } = mount({ coarse: true, mode: "editing" });
    const reached = vi.fn();
    view.scrollDOM.addEventListener("touchstart", reached);
    gutterCell(view).dispatchEvent(
      new Event("touchstart", { bubbles: true, cancelable: true }),
    );
    expect(reached).not.toHaveBeenCalled();
  });
});
