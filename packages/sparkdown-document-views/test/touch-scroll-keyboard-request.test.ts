import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { touchAffordances } from "../src/modules/script-editor/utils/extensions/touchAffordances";

const LINE_HEIGHT = 20;

let view: EditorView | undefined;
let clock = 0;
let tapPos = 0;

const mount = () => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n"),
      extensions: [touchAffordances(true)],
    }),
    parent,
  });
  vi.spyOn(view, "posAtCoords").mockImplementation(() => tapPos);
  view.focus();
  return view;
};

const keyboardPolicy = (v: EditorView) =>
  v.contentDOM.getAttribute("virtualkeyboardpolicy") ?? "auto";

const revealCaretLikeChrome = (v: EditorView) => {
  if (keyboardPolicy(v) === "manual") return;
  const caretLine = v.state.doc.lineAt(v.state.selection.main.head).number;
  v.scrollDOM.scrollTop = (caretLine - 1) * LINE_HEIGHT;
};

const touch = (v: EditorView, type: string, y: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const points = type === "touchend" ? [] : [{ clientX: 20, clientY: y }];
  Object.defineProperty(event, "touches", { value: points });
  Object.defineProperty(event, "targetTouches", { value: points });
  Object.defineProperty(event, "changedTouches", {
    value: [{ clientX: 20, clientY: y }],
  });
  v.contentDOM.dispatchEvent(event);
  if (type === "touchend") revealCaretLikeChrome(v);
};

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const drag = (v: EditorView, ys: number[]) => {
  touch(v, "touchstart", ys[0]!);
  for (const y of ys.slice(1)) {
    clock += 16;
    touch(v, "touchmove", y);
  }
};

beforeEach(() => {
  clock = 0;
  tapPos = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      Object.assign([], { item: () => null }) as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("a touch that scrolls the script with the keyboard open", () => {
  it("leaves the script where the finger lifted when the browser answers the end of a slow drag", async () => {
    const v = mount();
    clock = 1000;
    drag(v, [600, 500, 400, 300]);
    clock += 200;
    touch(v, "touchend", 300);
    expect(v.scrollDOM.scrollTop).toBe(300);

    await nextTask();
    expect(keyboardPolicy(v)).toBe("auto");
    expect(v.scrollDOM.scrollTop).toBe(300);
  });

  it("carries a fling on from where the finger lifted instead of from the caret", async () => {
    const v = mount();
    drag(v, [600, 500, 300]);
    clock += 8;
    touch(v, "touchend", 300);
    expect(v.scrollDOM.scrollTop).toBe(300);

    await nextFrame();
    expect(v.scrollDOM.scrollTop).toBeGreaterThan(300);
  });

  it("keeps the script where a tap stopped the fling", async () => {
    const v = mount();
    drag(v, [600, 500, 300]);
    clock += 8;
    touch(v, "touchend", 300);
    await nextTask();
    expect(keyboardPolicy(v)).toBe("auto");
    const stoppedAt = v.scrollDOM.scrollTop;
    expect(stoppedAt).toBeGreaterThanOrEqual(300);

    clock += 20;
    touch(v, "touchstart", 300);
    touch(v, "touchend", 300);
    expect(v.scrollDOM.scrollTop).toBe(stoppedAt);

    await nextTask();
    expect(keyboardPolicy(v)).toBe("auto");
    expect(v.scrollDOM.scrollTop).toBe(stoppedAt);
  });

  it("still moves the caret to a tapped line and lets the browser bring up the keyboard for it", () => {
    const v = mount();
    tapPos = v.state.doc.line(29).from;
    touch(v, "touchstart", 300);
    touch(v, "touchend", 300);
    expect(v.state.selection.main.head).toBe(tapPos);
    expect(v.hasFocus).toBe(true);
    expect(v.scrollDOM.scrollTop).toBe(28 * LINE_HEIGHT);
  });
});
