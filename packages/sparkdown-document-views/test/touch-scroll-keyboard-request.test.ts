import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { touchAffordances } from "../src/modules/script-editor/utils/extensions/touchAffordances";

let view: EditorView | undefined;

const mount = () => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n"),
      extensions: [touchAffordances(true)],
    }),
    parent,
  });
  vi.spyOn(view, "posAtCoords").mockReturnValue(0);
  view.focus();
  return view;
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
};

const keyboardPolicy = (v: EditorView) =>
  v.contentDOM.getAttribute("virtualkeyboardpolicy") ?? "auto";

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

beforeEach(() => {
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

describe("a touch that scrolls the script", () => {
  it("ends without asking the browser to show the keyboard, so an open keyboard does not pull the caret back into view", async () => {
    const v = mount();
    touch(v, "touchstart", 600);
    touch(v, "touchmove", 500);
    touch(v, "touchmove", 300);
    expect(v.scrollDOM.scrollTop).toBe(300);

    touch(v, "touchend", 300);
    expect(keyboardPolicy(v)).toBe("manual");

    await nextTask();
    expect(keyboardPolicy(v)).toBe("auto");
  });

  it("leaves a tap free to ask for the keyboard", async () => {
    const v = mount();
    touch(v, "touchstart", 300);
    touch(v, "touchend", 300);
    expect(keyboardPolicy(v)).toBe("auto");
  });
});
