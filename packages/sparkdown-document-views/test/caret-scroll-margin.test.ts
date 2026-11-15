import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  caretScrollMargin,
  scrollCaretIntoView,
} from "../src/modules/script-editor/utils/extensions/caretScrollMargin";

const scrollMarginsOf = (view: EditorView) => {
  const margins = { top: 0, bottom: 0 };
  for (const source of view.state.facet(EditorView.scrollMargins)) {
    const m = source(view);
    if (m?.top != null) margins.top = Math.max(margins.top, m.top);
    if (m?.bottom != null) margins.bottom = Math.max(margins.bottom, m.bottom);
  }
  return margins;
};

const caretClearance = (view: EditorView) => {
  const { y } = view.state.facet(EditorView.cursorScrollMargin);
  const insets = scrollMarginsOf(view);
  return { above: insets.top + y, below: insets.bottom + y };
};

describe("script editor caret scroll margin", () => {
  let view: EditorView | undefined;

  afterEach(() => {
    view?.destroy();
    view = undefined;
  });

  it("keeps the caret 12 px above the bottom edge and 8 px below the top", () => {
    view = new EditorView({
      state: EditorState.create({
        doc: "a\nb",
        extensions: [caretScrollMargin()],
      }),
      parent: document.body,
    });
    expect(caretClearance(view)).toEqual({ above: 8, below: 12 });
  });

  it("adds the caret margin on top of the host's bottom inset", () => {
    view = new EditorView({
      state: EditorState.create({
        doc: "a\nb",
        extensions: [caretScrollMargin({ bottom: 60 })],
      }),
      parent: document.body,
    });
    expect(caretClearance(view)).toEqual({ above: 8, below: 72 });
  });

  it("scrolls the caret into view with the same top and bottom clearance", () => {
    view = new EditorView({
      state: EditorState.create({
        doc: "a\nb",
        extensions: [caretScrollMargin()],
      }),
      parent: document.body,
    });
    const dispatch = vi.spyOn(view, "dispatch");

    scrollCaretIntoView(view);

    const target = (
      dispatch.mock.calls[0]![0] as {
        effects: { value: { y: string; yMargin: number } };
      }
    ).effects.value;
    const insets = scrollMarginsOf(view);
    expect(target.y).toBe("nearest");
    expect({
      above: insets.top + target.yMargin,
      below: insets.bottom + target.yMargin,
    }).toEqual({ above: 8, below: 12 });
  });
});
