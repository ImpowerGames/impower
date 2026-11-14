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

  it("moves a dot with its statement when a line is inserted at the statement's start", () => {
    const { view } = mount();
    pressGutterAt(view, 5);
    view.dispatch({
      changes: { from: view.state.doc.line(5).from, insert: "    Inserted.\n" },
    });
    expect(getBreakpointLineNumbers(view)).toEqual([6]);
    expect(view.state.doc.line(6).text).toBe("    The second line.");
  });

  it("keeps a dot when the blank line above its statement is deleted", () => {
    const { view } = mount();
    pressGutterAt(view, 5);
    const blank = view.state.doc.line(4);
    view.dispatch({ changes: { from: blank.from, to: blank.to + 1 } });
    expect(getBreakpointLineNumbers(view)).toEqual([4]);
    expect(view.state.doc.line(4).text).toBe("    The second line.");
  });

  it("keeps a dot on its line when text is typed at the line's start, so a press still removes it", () => {
    const { view } = mount();
    pressGutterAt(view, 5);
    view.dispatch({ changes: { from: view.state.doc.line(5).from, insert: "x" } });
    expect(getBreakpointLineNumbers(view)).toEqual([5]);
    pressGutterAt(view, 5);
    expect(getBreakpointLineNumbers(view)).toEqual([]);
  });

  it("deletes a dot with its line", () => {
    const { view } = mount();
    pressGutterAt(view, 5);
    view.dispatch({
      changes: { from: view.state.doc.line(5).from, to: view.state.doc.line(6).from },
    });
    expect(getBreakpointLineNumbers(view)).toEqual([]);
  });

  it("deletes a dot with the last line when the deletion runs from the line above to the end", () => {
    const { view } = mount();
    pressGutterAt(view, 6);
    const previous = view.state.doc.line(5);
    view.dispatch({ changes: { from: previous.to, to: view.state.doc.length } });
    expect(view.state.doc.lines).toBe(5);
    expect(getBreakpointLineNumbers(view)).toEqual([]);
  });

  it("keeps a dot on its line when only the line's text is cleared", () => {
    const { view } = mount();
    pressGutterAt(view, 5);
    const line = view.state.doc.line(5);
    view.dispatch({ changes: { from: line.from, to: line.to } });
    expect(getBreakpointLineNumbers(view)).toEqual([5]);
  });

  it("moves a dot to the line the debugger verified, and draws an unplaceable one hollow", () => {
    const { view } = mount();
    pressGutterAt(view, 4);
    pressGutterAt(view, 6);
    setBreakpointStates(view, [
      { line: 5, verified: true },
      { line: 6, verified: false },
    ]);
    expect(getBreakpointLineNumbers(view)).toEqual([5, 6]);
    expect(view.dom.querySelectorAll(".cm-breakpoint-unverified")).toHaveLength(1);
    expect(markers(view)).toHaveLength(2);
  });

  it("titles a hollow dot on a declaration line with the adapter's declaration reason", () => {
    const { view } = mount();
    setBreakpointStates(view, [
      { line: 2, verified: false, message: "A declaration runs before the story starts" },
    ]);
    const hollow = view.dom.querySelectorAll(".cm-breakpoint-unverified");
    expect(hollow).toHaveLength(1);
    expect(hollow[0]!.getAttribute("title")).toBe("A declaration runs before the story starts");
  });

  it("titles a hollow dot on a line with no statement with the adapter's no-statement reason", () => {
    const { view } = mount();
    setBreakpointStates(view, [
      { line: 3, verified: false, message: "No statement to stop at here." },
    ]);
    const hollow = view.dom.querySelectorAll(".cm-breakpoint-unverified");
    expect(hollow).toHaveLength(1);
    expect(hollow[0]!.getAttribute("title")).toBe("No statement to stop at here.");
  });

  it("gives each hollow dot its own reason and a placed dot none", () => {
    const { view } = mount();
    setBreakpointStates(view, [
      { line: 2, verified: false, message: "A declaration runs before the story starts" },
      { line: 3, verified: false, message: "No statement to stop at here." },
      { line: 5, verified: true },
    ]);
    const titles = [...view.dom.querySelectorAll(".cm-breakpoint")].map((dot) =>
      dot.getAttribute("title"),
    );
    expect(titles).toEqual([
      "A declaration runs before the story starts",
      "No statement to stop at here.",
      null,
    ]);
  });

  it("titles a hollow dot whose answer carries no reason with a neutral fallback", () => {
    const { view } = mount();
    setBreakpointStates(view, [{ line: 3, verified: false }]);
    const hollow = view.dom.querySelectorAll(".cm-breakpoint-unverified");
    expect(hollow[0]!.getAttribute("title")).toBe("Breakpoint not placed.");
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

  it("clears a breakpoint when its own button is pressed", () => {
    const { view } = mount();
    pressGutterAt(view, 3);
    const block = view.lineBlockAt(view.state.doc.line(3).from);
    vi.spyOn(view, "lineBlockAtHeight").mockReturnValue(block);
    markers(view)[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(getBreakpointLineNumbers(view)).toEqual([]);
  });

  it("clears a breakpoint from the keyboard, and a mouse click after the press does not toggle it again", () => {
    const { view } = mount();
    pressGutterAt(view, 3);
    const button = markers(view)[0] as HTMLButtonElement;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    expect(getBreakpointLineNumbers(view)).toEqual([3]);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    expect(getBreakpointLineNumbers(view)).toEqual([]);
  });

  it("draws each breakpoint as a gutter button assistive technology can reach, with its name", async () => {
    const { view } = mount();
    setBreakpointStates(view, [
      { line: 3, verified: true },
      { line: 5, verified: false, message: "No statement to stop at here." },
    ]);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const buttons = markers(view);
    expect(buttons.map((b) => [b.tagName, b.classList.contains("cm-gutter-button"), b.getAttribute("aria-label")])).toEqual([
      ["BUTTON", true, "Remove breakpoint"],
      ["BUTTON", true, "Remove breakpoint. No statement to stop at here."],
    ]);
    expect(buttons[0]!.closest("[aria-hidden=true]")).toBeNull();
    expect(view.dom.querySelector(".cm-lineNumbers")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows its hover ghost under a fine pointer only", () => {
    mount();
    const ghost = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => (rule as CSSStyleRule).selectorText ?? "")
      .filter((selector) => selector.includes(".cm-breakpoint-gutter") && selector.includes(":hover::after"));
    expect(ghost).toHaveLength(1);
    expect(ghost[0]).toContain(":not(.cm-breakpoints-coarse)");
    expect(ghost[0]).toContain(":not(:has(.cm-breakpoint))");
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
