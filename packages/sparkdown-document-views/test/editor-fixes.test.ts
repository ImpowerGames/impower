import { history, redo, undo } from "@codemirror/commands";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { ChangeSet, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LSPPlugin } from "@impower/codemirror-vscode-lsp-client/src";
import type { EditorFix } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import {
  STILL_EXPECTED_CASES,
  caseRange,
} from "@impower/sparkdown/src/tests/compiler/stillExpectedCases";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PROBLEM_POPOVER_DELAY,
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
  vi.restoreAllMocks();
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
      expect(applied !== null).toBe(testCase.still);
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
    ).not.toBeNull();
    expect(view.state.doc.toString()).toBe("show alice");
    undo(view);
    expect(view.state.doc.toString()).toBe("show alcie");
  });

  const useAlice = (view: EditorView, id: number) =>
    applyEditorFix(
      view,
      fixFor("show alcie", 5, 10, "alice", { expect: "alcie", kind: "name" }),
      id,
    )!;

  it("undoes exactly that fix after later typing elsewhere", () => {
    const view = editor("show alcie");
    const revert = useAlice(view, 7);
    view.dispatch({ changes: { from: 0, insert: "Hi. " } });
    expect(undoEditorFix(view, { uri: URI, fix: 7, revert })).toBe(true);
    expect(view.state.doc.toString()).toBe("Hi. show alcie");
  });

  it("restores exactly from the toast after the editor undid and redid the fix", () => {
    const view = editor("show alcie");
    const revert = useAlice(view, 7);
    undo(view);
    redo(view);
    expect(view.state.doc.toString()).toBe("show alice");
    expect(undoEditorFix(view, { uri: URI, fix: 7, revert })).toBe(true);
    expect(view.state.doc.toString()).toBe("show alcie");
  });

  it("refuses the toast Undo once the editor has already undone the fix", () => {
    const view = editor("show alcie");
    const revert = useAlice(view, 7);
    undo(view);
    expect(undoEditorFix(view, { uri: URI, fix: 7, revert })).toBe(false);
    expect(view.state.doc.toString()).toBe("show alcie");
  });

  it("refuses to undo once the fixed text was edited", () => {
    const view = editor("show alcie");
    const revert = useAlice(view, 7);
    view.dispatch({ changes: { from: 10, insert: "x" } });
    expect(undoEditorFix(view, { uri: URI, fix: 7, revert })).toBe(false);
    expect(view.state.doc.toString()).toBe("show alicex");
  });

  it("undoes the fix in a reopened editor that never saw it, while the fixed text is still where it was put", () => {
    const revert = useAlice(editor("show alcie"), 7);
    const reopened = editor("show alice");
    expect(undoEditorFix(reopened, { uri: URI, fix: 7, revert })).toBe(true);
    expect(reopened.state.doc.toString()).toBe("show alcie");
    const edited = editor("show alicia");
    expect(undoEditorFix(edited, { uri: URI, fix: 7, revert })).toBe(false);
    expect(edited.state.doc.toString()).toBe("show alicia");
  });

  it("refuses to restore a removed note in a reopened editor once the script was typed in, rather than at a moved offset", () => {
    const NEWLINE = String.fromCharCode(10);
    const text = ["Hello.", "// TODO: tidy", "Bye."].join(NEWLINE);
    const at = text.indexOf("// TODO");
    const revert = applyEditorFix(
      editor(text),
      {
        ...fixFor(text, at, at + 13, "", { expect: "// TODO: tidy", kind: "note" }),
        changes: [{ from: at, to: at + 14, insert: "" }],
      },
      7,
    )!;
    expect(revert).not.toBeNull();
    const typed = "Intro. " + ["Hello.", "Bye."].join(NEWLINE);
    const reopened = editor(typed);
    expect(undoEditorFix(reopened, { uri: URI, fix: 7, revert })).toBe(false);
    expect(reopened.state.doc.toString()).toBe(typed);
  });
});

describe("a fix applied over typing the server has not seen yet", () => {
  const NEWLINE = String.fromCharCode(10);

  const typedSince = (view: EditorView, version: number, change: { from: number; to?: number; insert: string }) => {
    const synced = view.state.doc;
    const unsynced = ChangeSet.of(change, synced.length);
    view.dispatch({ changes: unsynced });
    vi.spyOn(LSPPlugin, "get").mockReturnValue({
      syncedDoc: synced,
      unsyncedChanges: unsynced,
      client: { workspace: { getFile: () => ({ version }) } },
    } as unknown as LSPPlugin);
  };

  it("maps a name fix over typing earlier in the script, and refuses one from another version", () => {
    const view = editor("show alcie");
    typedSince(view, 4, { from: 0, insert: "Hi. " });
    const fix = fixFor("show alcie", 5, 10, "alice", { expect: "alcie", kind: "name" });
    expect(applyEditorFix(view, { ...fix, version: 3 }, 1)).toBeNull();
    expect(view.state.doc.toString()).toBe("Hi. show alcie");
    expect(applyEditorFix(view, { ...fix, version: 4 }, 2)).not.toBeNull();
    expect(view.state.doc.toString()).toBe("Hi. show alice");
  });

  it("refuses to remove a note line whose indentation the author has since typed into", () => {
    const text = "  // TODO: tidy" + NEWLINE + "Hello.";
    const view = editor(text);
    typedSince(view, 2, { from: 1, insert: "Hi." });
    const fix = {
      ...fixFor(text, 0, 16, "", { expect: "// TODO: tidy", kind: "note" as const }),
      version: 2,
      range: { start: { line: 0, character: 2 }, end: { line: 0, character: 15 } },
    };
    expect(applyEditorFix(view, fix, 1)).toBeNull();
    expect(view.state.doc.toString()).toBe(" Hi. // TODO: tidy" + NEWLINE + "Hello.");
  });

  it("refuses a fix that carries no expected text once typing replaced what it would delete", () => {
    const text = "include scripts/defs.sd" + NEWLINE + "Gold.";
    const view = editor(text);
    typedSince(view, 2, { from: 0, to: 23, insert: "I wrote this story." });
    const fix = { ...fixFor(text, 0, 24, ""), version: 2 };
    expect(applyEditorFix(view, fix, 1)).toBeNull();
    expect(view.state.doc.toString()).toBe("I wrote this story." + NEWLINE + "Gold.");
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

  const hoverAt = (view: EditorView, pos: number) => {
    vi.spyOn(view, "posAtCoords").mockReturnValue(pos);
    vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 50, right: 100, top: 0, bottom: 20 });
    view.dom.dispatchEvent(new MouseEvent("pointermove", { clientX: 70, clientY: 10 }));
  };

  it("opens after the hover delay over the problem", () => {
    vi.useFakeTimers();
    const view = editor("show alcie", [history(), problemMarks()]);
    view.dispatch(setDiagnostics(view.state, [diagnostic()]));
    hoverAt(view, 7);
    vi.advanceTimersByTime(PROBLEM_POPOVER_DELAY - 1);
    expect(popover(view)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(popover(view)?.textContent).toContain("Cannot find alcie");
  });

  it("drops a pending hover when typing removes the text under the pointer", () => {
    vi.useFakeTimers();
    const view = editor("show alcie", [history(), problemMarks()]);
    view.dispatch(setDiagnostics(view.state, [diagnostic()]));
    hoverAt(view, 7);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length } });
    expect(() => vi.advanceTimersByTime(PROBLEM_POPOVER_DELAY + 1)).not.toThrow();
    expect(popover(view)).toBeNull();
  });

  it("closes the next popover after its grace once a fix was chosen from inside the last one", () => {
    vi.useFakeTimers();
    const view = withProblem();
    popover(view)!.dispatchEvent(new Event("pointerenter"));
    popover(view)!.querySelector("button")!.click();
    expect(popover(view)).toBeNull();
    view.dispatch({ effects: setProblemPopover.of({ pos: 7, line: false }) });
    view.dom.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(PROBLEM_POPOVER_GRACE);
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
