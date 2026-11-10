import { history, undo } from "@codemirror/commands";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { EditorFix } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import {
  STILL_EXPECTED_CASES,
  caseRange,
} from "@impower/sparkdown/src/tests/compiler/stillExpectedCases";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PROBLEM_POPOVER_GRACE,
  problemMarks,
  setProblemPopover,
} from "../src/cm-problem-marks/problemMarks";
import {
  applyEditorFix,
  editorFixes,
  undoEditorFix,
} from "../src/modules/script-editor/utils/extensions/editorFixes";

Range.prototype.getClientRects ??= () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const URI = "file:///p/main.sd";

const views: EditorView[] = [];

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  views.splice(0).forEach((view) => {
    view.destroy();
    view.dom.remove();
  });
  vi.useRealTimers();
});

const editor = (doc: string, extensions = [history(), editorFixes()]) => {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  views.push(view);
  return view;
};

const positionIn = (text: string, offset: number) => {
  const before = text.slice(0, offset).split(String.fromCharCode(10));
  return { line: before.length - 1, character: before.at(-1)!.length };
};

const fixFor = (
  text: string,
  from: number,
  to: number,
  insert: string,
  guard: Pick<EditorFix, "expect" | "kind"> = {},
): EditorFix => ({
  uri: URI,
  range: { start: positionIn(text, from), end: positionIn(text, to) },
  changes: [{ from, to, insert }],
  ...guard,
});

describe("a fix applied in the open editor", () => {
  it.each(STILL_EXPECTED_CASES.map((c) => [c.label, c] as const))(
    "follows the shared stale check for %s",
    (_, testCase) => {
      const { from, to } = caseRange(testCase);
      const view = editor(testCase.after);
      const applied = applyEditorFix(
        view,
        fixFor(testCase.before, from, to, "FIXED", {
          expect: testCase.expect,
          kind: testCase.kind,
        }),
        1,
      );
      expect(applied).toBe(testCase.still);
      expect(view.state.doc.toString()).toBe(
        testCase.still
          ? testCase.after.slice(0, from) + "FIXED" + testCase.after.slice(to)
          : testCase.after,
      );
    },
  );

  it("lands in the editor's history, so Undo in the editor reverts it", () => {
    const view = editor("show alcie");
    expect(
      applyEditorFix(
        view,
        fixFor("show alcie", 5, 10, "alice", { expect: "alcie", kind: "name" }),
        1,
      ),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe("show alice");
    undo(view);
    expect(view.state.doc.toString()).toBe("show alcie");
  });

  it("undoes exactly that fix after later typing elsewhere", () => {
    const view = editor("show alcie");
    applyEditorFix(
      view,
      fixFor("show alcie", 5, 10, "alice", { expect: "alcie", kind: "name" }),
      7,
    );
    view.dispatch({ changes: { from: 0, insert: "Hi. " } });
    expect(undoEditorFix(view, 7)).toBe(true);
    expect(view.state.doc.toString()).toBe("Hi. show alcie");
  });

  it("refuses to undo once the fixed text was edited, or for another fix", () => {
    const view = editor("show alcie");
    applyEditorFix(
      view,
      fixFor("show alcie", 5, 10, "alice", { expect: "alcie", kind: "name" }),
      7,
    );
    expect(undoEditorFix(view, 8)).toBe(false);
    view.dispatch({ changes: { from: 10, insert: "x" } });
    expect(undoEditorFix(view, 7)).toBe(false);
    expect(view.state.doc.toString()).toBe("show alicex");
  });
});

describe("the problem popover", () => {
  const diagnostic = (apply = vi.fn()): Diagnostic => ({
    from: 5,
    to: 10,
    severity: "warning",
    message: "Cannot find alcie",
    actions: [{ name: "Use alice instead", apply }],
  });

  const withProblem = (apply = vi.fn()) => {
    const view = editor("show alcie", [history(), problemMarks()]);
    view.dispatch(setDiagnostics(view.state, [diagnostic(apply)]));
    view.dispatch({ effects: setProblemPopover.of({ pos: 7, line: false }) });
    return view;
  };

  const popover = (view: EditorView) =>
    view.dom.querySelector<HTMLElement>(".cm-problem-popover");

  it("shows the message with the fix as one button, and choosing it applies the action", () => {
    const apply = vi.fn();
    const view = withProblem(apply);
    expect(popover(view)?.textContent).toContain("Cannot find alcie");
    const button = popover(view)!.querySelector("button")!;
    expect(button.textContent).toBe("Use alice instead");
    button.click();
    expect(apply).toHaveBeenCalledWith(view, 5, 10);
    expect(popover(view)).toBeNull();
  });

  it("stays open for the grace after the pointer leaves, then closes", () => {
    vi.useFakeTimers();
    const view = withProblem();
    view.dom.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(PROBLEM_POPOVER_GRACE - 1);
    expect(popover(view)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(popover(view)).toBeNull();
  });

  it("stays open while the pointer returns within the grace", () => {
    vi.useFakeTimers();
    const view = withProblem();
    view.dom.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(PROBLEM_POPOVER_GRACE - 50);
    popover(view)!.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(PROBLEM_POPOVER_GRACE);
    expect(popover(view)).not.toBeNull();
  });
});
