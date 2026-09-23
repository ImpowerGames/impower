// The touch text-selection menu and handles (#789) behave like Android's
// native floating selection toolbar: where the menu goes, what a menu tap does
// to focus and the selection, when the menu closes, and which gestures open it.
//
// jsdom has no layout, so each test gives the editor a fixed one: lines are
// 16px tall and characters 8px wide, starting at the scroller's top-left
// corner, and `scrollOffset` stands in for the scroller's scroll position. The
// visual viewport is the phone's with the keyboard open (384 x 383) unless a
// test changes it.
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  contextMenu,
  hideContextMenu,
  isContextMenuOpen,
  showContextMenu,
} from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { touchInputHandler } from "../src/modules/script-editor/utils/extensions/touchInputHandler";

const LINE_HEIGHT = 16;
const CHAR_WIDTH = 8;
const TEXT_LEFT = 41;
const WINDOW_HEIGHT = 693;
const KEYBOARD_OPEN_HEIGHT = 383;

// The rendered sizes of the two menu shapes.
const BAR = { width: 324, height: 41 };
const LIST = { width: 180, height: 190 };

let view: EditorView | undefined;
let scroller = { left: 0, top: 104, right: 384, bottom: 254 };
let scrollOffset = 0;
let viewport: EventTarget & {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
};

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON() {},
  }) as DOMRect;

beforeEach(() => {
  scroller = { left: 0, top: 104, right: 384, bottom: 254 };
  scrollOffset = 0;
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: 5,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: WINDOW_HEIGHT,
    configurable: true,
  });
  Object.defineProperty(window, "innerWidth", {
    value: 384,
    configurable: true,
  });
  // CodeMirror keeps tooltips inside the document element's client area.
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: 384,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    value: WINDOW_HEIGHT,
    configurable: true,
  });
  viewport = Object.assign(new EventTarget(), {
    width: 384,
    height: KEYBOARD_OPEN_HEIGHT,
    offsetLeft: 0,
    offsetTop: 0,
  });
  Object.defineProperty(window, "visualViewport", {
    value: viewport,
    configurable: true,
  });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  // A menu reports its size at the position the tooltip gave it.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.classList.contains("cm-context-menu")) {
        const size = this.classList.contains("cm-vertical") ? LIST : BAR;
        return rect(
          parseFloat(this.style.left) || 0,
          parseFloat(this.style.top) || 0,
          size.width,
          size.height,
        );
      }
      return new DOMRect();
    },
  );
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
});

/** An editor with the web editor's touch handler and menu, laid out on the
 *  fixed grid described at the top of this file. */
function mount(doc: string, selection?: EditorSelection) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  view = new EditorView({
    doc,
    selection,
    parent,
    extensions: [
      contextMenu(),
      touchInputHandler({
        showContextMenu,
        hideContextMenu,
        isContextMenuOpen,
        isTouchEnvironment: () => true,
      }),
    ],
  });
  const v = view;
  v.scrollDOM.getBoundingClientRect = () =>
    rect(
      scroller.left,
      scroller.top,
      scroller.right - scroller.left,
      scroller.bottom - scroller.top,
    );
  v.contentDOM.getBoundingClientRect = () =>
    rect(TEXT_LEFT, scroller.top - scrollOffset, 343, 10000);
  v.coordsAtPos = (pos: number) => {
    const line = v.state.doc.lineAt(pos);
    const left = TEXT_LEFT + (pos - line.from) * CHAR_WIDTH;
    const top = scroller.top - scrollOffset + (line.number - 1) * LINE_HEIGHT;
    return { left, right: left, top, bottom: top + LINE_HEIGHT };
  };
  v.posAtCoords = ((coords: { x: number; y: number }) => {
    const number =
      Math.floor((coords.y - scroller.top + scrollOffset) / LINE_HEIGHT) + 1;
    if (number < 1 || number > v.state.doc.lines) return null;
    const line = v.state.doc.line(number);
    const col = Math.round((coords.x - TEXT_LEFT) / CHAR_WIDTH);
    return line.from + Math.max(0, Math.min(col, line.length));
  }) as EditorView["posAtCoords"];
  return v;
}

/** Client coordinates of the middle of `text` on line `lineNumber`. */
function pointAt(v: EditorView, lineNumber: number, text: string) {
  const line = v.state.doc.line(lineNumber);
  const from = line.from + line.text.indexOf(text);
  const start = v.coordsAtPos(from)!;
  return {
    x: start.left + (text.length * CHAR_WIDTH) / 2,
    y: (start.top + start.bottom) / 2,
  };
}

function touch(
  target: EventTarget,
  type: "touchstart" | "touchmove" | "touchend",
  point?: { x: number; y: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches =
    point && type !== "touchend"
      ? [{ clientX: point.x, clientY: point.y }]
      : [];
  Object.defineProperty(event, "touches", { value: touches });
  target.dispatchEvent(event);
}

function tap(v: EditorView, point: { x: number; y: number }) {
  touch(v.scrollDOM, "touchstart", point);
  touch(v.scrollDOM, "touchend", point);
}

function longPress(v: EditorView, point: { x: number; y: number }) {
  touch(v.scrollDOM, "touchstart", point);
  vi.advanceTimersByTime(600);
  touch(v.scrollDOM, "touchend", point);
}

function menu() {
  return document.querySelector<HTMLElement>(".cm-context-menu");
}

function menuLabels() {
  return [...(menu()?.querySelectorAll(".cm-menu-item") ?? [])].map(
    (el) =>
      el.textContent || (el.classList.contains("cm-menu-more") ? "⋮" : ""),
  );
}

function menuItem(label: string) {
  return [
    ...(menu()?.querySelectorAll<HTMLElement>(".cm-menu-item") ?? []),
  ].find(
    (el) =>
      (el.textContent || (el.classList.contains("cm-menu-more") ? "⋮" : "")) ===
      label,
  )!;
}

/** Runs CodeMirror's pending layout reads and writes now, as the next
 *  animation frame would. `measure` is public at runtime but left out of the
 *  published types. */
function flushMeasure() {
  (view as unknown as { measure(): void }).measure();
}

function menuBox() {
  flushMeasure();
  const el = menu()!;
  const left = parseFloat(el.style.left);
  const top = parseFloat(el.style.top);
  const size = el.classList.contains("cm-vertical") ? LIST : BAR;
  return { left, top, right: left + size.width, bottom: top + size.height };
}

function handleShown(kind: "start" | "end" | "cursor") {
  flushMeasure();
  const el = view!.dom.querySelector<HTMLElement>(
    `.cm-touch-selection-handle-${kind}`,
  )!;
  return el.style.display === "block";
}

const DOC = Array.from({ length: 40 }, (_, i) =>
  i === 3 || i === 4 ? "" : i === 5 ? "short" : `Line ${i + 1} hello world`,
).join("\n");

function selectWord(v: EditorView, lineNumber: number, word: string) {
  const line = v.state.doc.line(lineNumber);
  const from = line.from + line.text.indexOf(word);
  v.dispatch({
    selection: EditorSelection.range(from, from + word.length),
    userEvent: "select.touch",
  });
  showContextMenu(v, { pos: from, end: from + word.length });
  return { from, to: from + word.length };
}

describe("menu placement", () => {
  it("sits above the selection, outside the editor, when the editor is too short to hold it", () => {
    const v = mount(DOC);
    // Line 1 is at the very top of a 150px editor: no room above it inside
    // the editor, but room above it in the viewport, over the page header.
    selectWord(v, 1, "world");
    const box = menuBox();
    const selectionTop = v.coordsAtPos(v.state.selection.main.from)!.top;
    expect(box.bottom).toBeLessThanOrEqual(selectionTop);
    expect(box.top).toBeGreaterThanOrEqual(0);
  });

  it("goes below the selection, clear of the handles, when there is no room above it in the viewport", () => {
    scroller = { left: 0, top: 10, right: 384, bottom: 254 };
    const v = mount(DOC);
    selectWord(v, 1, "world");
    const box = menuBox();
    const selectionBottom = v.coordsAtPos(v.state.selection.main.to)!.bottom;
    expect(box.top).toBeGreaterThanOrEqual(selectionBottom + 20);
  });

  it("is centred over the selection", () => {
    // Wide enough that the viewport's edges do not clamp the menu.
    viewport.width = 800;
    Object.defineProperty(document.documentElement, "clientWidth", {
      value: 800,
      configurable: true,
    });
    const v = mount("Line 1 hello world alpha beta gamma delta epsilon");
    const { from, to } = selectWord(v, 1, "gamma");
    const box = menuBox();
    const centre = (v.coordsAtPos(from)!.left + v.coordsAtPos(to)!.left) / 2;
    expect((box.left + box.right) / 2).toBeCloseTo(centre, 0);
  });

  it("is pinned to the top of the viewport while the selection is scrolled out of view", () => {
    const v = mount(DOC);
    selectWord(v, 3, "world");
    scrollOffset = 400;
    const box = menuBox();
    expect(box.top).toBeLessThan(scroller.top - BAR.height);
    expect(box.top).toBeGreaterThanOrEqual(0);
  });

  it("opens the overflow list where the ⋮ button was", () => {
    const v = mount(DOC);
    selectWord(v, 3, "world");
    const bar = menuBox();
    menuItem("⋮").click();
    expect(menuLabels()[0]).toBe("Back");
    const list = menuBox();
    expect(list.right).toBeCloseTo(bar.right, 0);
    expect(list.top).toBeCloseTo(bar.top, 0);
  });
});

describe("menu items", () => {
  it("do not take focus when pressed", () => {
    const v = mount(DOC);
    selectWord(v, 3, "world");
    const press = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    menuItem("Copy").dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });

  it("Copy leaves a caret at the end of the copied text", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const v = mount(DOC);
    const { to } = selectWord(v, 3, "world");
    menuItem("Copy").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("world"));
    await vi.waitFor(() => {
      expect(v.state.selection.main.empty).toBe(true);
      expect(v.state.selection.main.head).toBe(to);
    });
  });

  it("Select All selects everything and leaves the menu open", () => {
    const v = mount(DOC);
    selectWord(v, 3, "world");
    menuItem("Select All").click();
    expect(v.state.selection.main.from).toBe(0);
    expect(v.state.selection.main.to).toBe(v.state.doc.length);
    expect(isContextMenuOpen(v)).toBe(true);
  });

  it("leave out Cut and Copy when nothing is selected", () => {
    const v = mount(DOC, EditorSelection.single(20));
    showContextMenu(v, { pos: 20, end: 20 });
    expect(menuLabels()).toEqual(["Paste", "Select All", "⋮"]);
  });
});

describe("closing the menu", () => {
  it("typing closes it", () => {
    const v = mount(DOC);
    const { from, to } = selectWord(v, 3, "world");
    v.dispatch({
      changes: { from, to, insert: "Z" },
      selection: { anchor: from + 1 },
      userEvent: "input.type",
    });
    expect(isContextMenuOpen(v)).toBe(false);
  });

  it("a change the user did not make leaves it open", () => {
    const v = mount(DOC);
    selectWord(v, 3, "world");
    v.dispatch({ changes: { from: 0, insert: "x" } });
    expect(isContextMenuOpen(v)).toBe(true);
  });

  it("closing the keyboard keeps focus, the selection and the menu", () => {
    const v = mount(DOC);
    v.focus();
    selectWord(v, 3, "world");
    expect(v.hasFocus).toBe(true);
    viewport.height = WINDOW_HEIGHT;
    viewport.dispatchEvent(new Event("resize"));
    expect(v.hasFocus).toBe(true);
    expect(isContextMenuOpen(v)).toBe(true);
  });
});

describe("touch gestures", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("a long-press on a word selects it and opens the full menu", () => {
    const v = mount(DOC);
    longPress(v, pointAt(v, 3, "world"));
    expect(
      v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to),
    ).toBe("world");
    expect(menuLabels()).toEqual(["Cut", "Copy", "Paste", "Select All", "⋮"]);
  });

  it("a long-press past the end of a line places the caret there and opens the insertion menu", () => {
    const v = mount(DOC);
    const line = v.state.doc.line(6);
    const end = v.coordsAtPos(line.to)!;
    longPress(v, { x: end.left + 100, y: (end.top + end.bottom) / 2 });
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.selection.main.head).toBe(line.to);
    expect(menuLabels()).toEqual(["Paste", "Select All", "⋮"]);
  });

  it("a long-press on an empty line opens the insertion menu", () => {
    const v = mount(DOC);
    const line = v.state.doc.line(4);
    const start = v.coordsAtPos(line.from)!;
    longPress(v, { x: start.left + 40, y: (start.top + start.bottom) / 2 });
    expect(v.state.selection.main.empty).toBe(true);
    expect(menuLabels()).toEqual(["Paste", "Select All", "⋮"]);
  });

  it("a double tap on a word, with the editor focused, selects it and opens the menu", () => {
    const v = mount(DOC);
    v.focus();
    const point = pointAt(v, 3, "world");
    tap(v, point);
    tap(v, point);
    expect(
      v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to),
    ).toBe("world");
    expect(isContextMenuOpen(v)).toBe(true);
  });

  it("a double tap that focuses the editor only places the caret", () => {
    const v = mount(DOC);
    const point = pointAt(v, 3, "world");
    tap(v, point);
    tap(v, point);
    expect(v.state.selection.main.empty).toBe(true);
    expect(isContextMenuOpen(v)).toBe(false);
  });

  it("a tap on the caret handle opens the insertion menu, and a second tap closes it", () => {
    const v = mount(DOC);
    // Far from the previous test's taps, so this is a single tap.
    tap(v, pointAt(v, 10, "Line"));
    expect(v.state.selection.main.empty).toBe(true);
    const handle = v.dom.querySelector(".cm-touch-selection-handle-cursor")!;
    const point = { x: 0, y: 0 };
    touch(handle, "touchstart", point);
    touch(handle, "touchend", point);
    expect(menuLabels()).toEqual(["Paste", "Select All", "⋮"]);
    touch(handle, "touchstart", point);
    touch(handle, "touchend", point);
    expect(isContextMenuOpen(v)).toBe(false);
  });

  it("the selection handles come back when the selection scrolls back into view", () => {
    const v = mount(DOC);
    v.focus();
    longPress(v, pointAt(v, 3, "world"));
    expect(handleShown("start")).toBe(true);
    expect(handleShown("end")).toBe(true);

    scrollOffset = 400;
    v.scrollDOM.dispatchEvent(new Event("scroll"));
    expect(handleShown("start")).toBe(false);

    scrollOffset = 0;
    v.scrollDOM.dispatchEvent(new Event("scroll"));
    expect(handleShown("start")).toBe(true);
    expect(handleShown("end")).toBe(true);
  });
});
