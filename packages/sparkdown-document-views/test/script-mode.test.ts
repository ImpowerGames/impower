import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  onReadingDoubleTap,
  scriptMode,
  setScriptMode,
} from "../src/modules/script-editor/utils/extensions/scriptMode";

let view: EditorView | undefined;
let parent: HTMLElement | undefined;
const doubleTaps = { count: 0 };

const mount = (mode: "reading" | "editing" | null, editable = true) => {
  parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: "one\ntwo\nthree",
      extensions: [
        scriptMode(mode),
        onReadingDoubleTap.of(() => doubleTaps.count++),
        EditorView.editable.of(editable),
      ],
    }),
    parent,
  });
  vi.spyOn(view, "posAtCoords").mockReturnValue(5);
  return view;
};

const dispatch = (v: EditorView, type: string, pointerType?: string) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  if (pointerType) {
    Object.defineProperty(event, "pointerType", { value: pointerType });
  }
  v.contentDOM.dispatchEvent(event);
};

beforeEach(() => {
  doubleTaps.count = 0;
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  parent?.remove();
  parent = undefined;
  vi.restoreAllMocks();
});

describe("the script mode extension", () => {
  it("moves the reading caret on a tap, without touching a mouse press", () => {
    const v = mount("reading", false);
    dispatch(v, "click", "touch");
    expect(v.state.selection.main.head).toBe(5);

    v.dispatch({ selection: { anchor: 0 } });
    dispatch(v, "click", "mouse");
    expect(v.state.selection.main.head).toBe(0);
  });

  it("leaves a tap alone while editing", () => {
    const v = mount("editing");
    dispatch(v, "click", "touch");
    expect(v.state.selection.main.head).toBe(0);
  });

  it("asks to start editing from a double tap, at the tapped position", () => {
    const v = mount("reading", false);
    dispatch(v, "dblclick");
    expect(doubleTaps.count).toBe(1);
    expect(v.state.selection.main.head).toBe(5);
  });

  it("ignores a double tap while editing", () => {
    const v = mount("editing");
    dispatch(v, "dblclick");
    expect(doubleTaps.count).toBe(0);
  });

  it("marks the editor while editing so its status line gives way to the toolbar", () => {
    const v = mount("reading", false);
    expect(v.dom.classList.contains("cm-script-editing")).toBe(false);
    v.dispatch({ effects: setScriptMode.of("editing") });
    expect(v.dom.classList.contains("cm-script-editing")).toBe(true);
    v.dispatch({ effects: setScriptMode.of("reading") });
    expect(v.dom.classList.contains("cm-script-editing")).toBe(false);
  });
});
