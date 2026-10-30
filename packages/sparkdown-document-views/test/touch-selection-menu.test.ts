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
const MAX_SCROLL_TOP = 500;

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
  let scrollTop = 0;
  Object.defineProperty(v.scrollDOM, "scrollTop", {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Math.max(0, Math.min(value, MAX_SCROLL_TOP));
    },
    configurable: true,
  });
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
    if (number < 1) return 0;
    if (number > v.state.doc.lines) return v.state.doc.length;
    const line = v.state.doc.line(number);
    const col = Math.round((coords.x - TEXT_LEFT) / CHAR_WIDTH);
    return line.from + Math.max(0, Math.min(col, line.length));
  }) as EditorView["posAtCoords"];
  Object.defineProperty(v, "documentTop", {
    get: () => scroller.top - scrollOffset,
    configurable: true,
  });
  v.lineBlockAt = ((pos: number) => {
    const line = v.state.doc.lineAt(pos);
    const top = (line.number - 1) * LINE_HEIGHT;
    return {
      from: line.from,
      to: line.to,
      top,
      height: LINE_HEIGHT,
      bottom: top + LINE_HEIGHT,
    };
  }) as unknown as EditorView["lineBlockAt"];
  return v;
}

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

function swipe(v: EditorView, fromY: number, toY: number) {
  const x = 200;
  touch(v.scrollDOM, "touchstart", { x, y: fromY });
  touch(v.scrollDOM, "touchmove", { x, y: (fromY + toY) / 2 });
  touch(v.scrollDOM, "touchmove", { x, y: toY });
  touch(v.scrollDOM, "touchend", { x, y: toY });
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

  it("sits beside a caret at a soft wrap, on the line where the caret is drawn", () => {
    const v = mount(DOC, EditorSelection.single(30));
    const layout = v.coordsAtPos.bind(v);
    v.coordsAtPos = (pos: number, side = 1) => {
      if (pos !== 30) return layout(pos, side);
      const wrap = layout(pos, side)!;
      return side < 0
        ? wrap
        : { ...wrap, top: wrap.bottom, bottom: wrap.bottom + LINE_HEIGHT };
    };
    showContextMenu(v, { pos: 30, end: 30 });
    const caret = v.coordsAtPos(30, 1)!;
    const box = menuBox();
    expect(box.bottom).toBeLessThanOrEqual(caret.top);
    expect(box.bottom).toBeGreaterThanOrEqual(caret.top - 16);
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

  it("comes back beside its selection from the overflow list after an edit the user did not make", () => {
    viewport.width = 800;
    Object.defineProperty(document.documentElement, "clientWidth", {
      value: 800,
      configurable: true,
    });
    const v = mount(DOC);
    const { from } = selectWord(v, 3, "world");
    v.dispatch({ changes: { from, insert: "x".repeat(20) } });
    menuItem("⋮").click();
    menuItem("Back").click();
    const { from: movedFrom, to: movedTo } = v.state.selection.main;
    const box = menuBox();
    const centre =
      (v.coordsAtPos(movedFrom)!.left + v.coordsAtPos(movedTo)!.left) / 2;
    expect((box.left + box.right) / 2).toBeCloseTo(centre, 0);
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

  it("Copy leaves a caret, with its handle, at the end of the copied text", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const v = mount(DOC);
    v.focus();
    const { to } = selectWord(v, 3, "world");
    menuItem("Copy").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("world"));
    await vi.waitFor(() => {
      expect(v.state.selection.main.empty).toBe(true);
      expect(v.state.selection.main.head).toBe(to);
    });
    expect(handleShown("cursor")).toBe(true);
  });

  it("Copy leaves alone a selection made after it", async () => {
    let finishWrite = () => {};
    const writeText = vi.fn(
      () => new Promise<void>((resolve) => (finishWrite = resolve)),
    );
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const v = mount(DOC);
    selectWord(v, 3, "world");
    menuItem("Copy").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("world"));
    const later = selectWord(v, 7, "hello");
    finishWrite();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(v.state.selection.main.from).toBe(later.from);
    expect(v.state.selection.main.to).toBe(later.to);
  });

  it("Select All selects everything, leaves the menu open and shows the handles", () => {
    const v = mount(DOC);
    v.focus();
    selectWord(v, 3, "world");
    menuItem("Select All").click();
    expect(v.state.selection.main.from).toBe(0);
    expect(v.state.selection.main.to).toBe(v.state.doc.length);
    expect(isContextMenuOpen(v)).toBe(true);
    expect(handleShown("start")).toBe(true);
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

  it("a change the user did not make keeps it beside its selection", () => {
    const v = mount(DOC);
    selectWord(v, 3, "world");
    const before = menuBox();
    v.dispatch({ changes: { from: 0, insert: "x".repeat(20) } });
    const after = menuBox();
    expect(after.top).toBeCloseTo(before.top, 0);
  });

  it("a change the user did not make at the selection's start keeps it beside the selection", () => {
    viewport.width = 800;
    Object.defineProperty(document.documentElement, "clientWidth", {
      value: 800,
      configurable: true,
    });
    const v = mount(DOC);
    const { from } = selectWord(v, 3, "world");
    v.dispatch({ changes: { from, insert: "x".repeat(20) } });
    const { from: movedFrom, to: movedTo } = v.state.selection.main;
    expect(v.state.sliceDoc(movedFrom, movedTo)).toBe("world");
    const box = menuBox();
    const centre =
      (v.coordsAtPos(movedFrom)!.left + v.coordsAtPos(movedTo)!.left) / 2;
    expect((box.left + box.right) / 2).toBeCloseTo(centre, 0);
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
    expect(handleShown("cursor")).toBe(true);
  });

  it("a long-press past the end of a word that wraps places the caret there", () => {
    const WRAP = 15;
    const v = mount("averyveryverylongidentifier");
    v.coordsAtPos = (pos: number) => {
      const row = pos > WRAP ? 1 : 0;
      const left = TEXT_LEFT + (row ? pos - WRAP : pos) * CHAR_WIDTH;
      const top = scroller.top + row * LINE_HEIGHT;
      return { left, right: left, top, bottom: top + LINE_HEIGHT };
    };
    v.posAtCoords = ((coords: { x: number; y: number }) => {
      const row = Math.floor((coords.y - scroller.top) / LINE_HEIGHT);
      const col = Math.round((coords.x - TEXT_LEFT) / CHAR_WIDTH);
      const length = v.state.doc.length;
      return row === 0
        ? Math.max(0, Math.min(col, WRAP))
        : Math.max(WRAP, Math.min(WRAP + col, length));
    }) as EditorView["posAtCoords"];
    v.lineBlockAt = (() => ({
      from: 0,
      to: v.state.doc.length,
      top: 0,
      height: 2 * LINE_HEIGHT,
      bottom: 2 * LINE_HEIGHT,
    })) as unknown as EditorView["lineBlockAt"];
    const end = v.coordsAtPos(v.state.doc.length)!;
    longPress(v, { x: end.right + 100, y: (end.top + end.bottom) / 2 });
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.selection.main.head).toBe(v.state.doc.length);
    expect(menuLabels()).toEqual(["Paste", "Select All", "⋮"]);
  });

  it("a long-press on a word, below its glyphs but inside its row, selects it", () => {
    const v = mount(DOC);
    const layout = v.coordsAtPos.bind(v);
    v.coordsAtPos = (pos: number, side?: -1 | 1) => {
      const box = layout(pos, side)!;
      return { ...box, bottom: box.bottom - 4 };
    };
    const line = v.state.doc.line(3);
    const from = line.from + line.text.indexOf("world");
    const glyphs = v.coordsAtPos(from)!;
    longPress(v, {
      x: pointAt(v, 3, "world").x,
      y: glyphs.bottom + 2,
    });
    expect(
      v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to),
    ).toBe("world");
    expect(menuLabels()).toEqual(["Cut", "Copy", "Paste", "Select All", "⋮"]);
  });

  it("a long-press below the text places the caret at its end", () => {
    const v = mount("hello");
    const line = v.coordsAtPos(0)!;
    longPress(v, { x: line.left + 8, y: line.bottom + 3 * LINE_HEIGHT });
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.selection.main.head).toBe(v.state.doc.length);
    expect(menuLabels()).toEqual(["Paste", "Select All", "⋮"]);
  });

  it("a press and hold on a handle or the menu keeps the editor's focus", async () => {
    const v = mount(DOC);
    v.focus();
    longPress(v, pointAt(v, 3, "world"));
    const targets = [
      () => menuItem("Copy"),
      () => v.dom.querySelector(".cm-touch-selection-handle-end")!,
    ];
    for (const find of targets) {
      const target = find();
      touch(target, "touchstart", { x: 0, y: 0 });
      v.contentDOM.blur();
      await Promise.resolve();
      expect(v.hasFocus).toBe(true);
      touch(target, "touchend", { x: 0, y: 0 });
    }
    v.contentDOM.blur();
    await Promise.resolve();
    expect(v.hasFocus).toBe(false);
  });

  it("a touch in the text lets Chrome's long-press gesture through the handles", () => {
    const v = mount(DOC);
    v.focus();
    tap(v, pointAt(v, 3, "world"));
    const handles = [...v.dom.querySelectorAll(".cm-touch-selection-handle")];
    const point = pointAt(v, 5, "");
    touch(v.scrollDOM, "touchstart", point);
    for (const handle of handles) {
      expect(handle.classList).toContain("cm-touch-selection-handle-inert");
    }
    touch(v.scrollDOM, "touchend", point);
    for (const handle of handles) {
      expect(handle.classList).not.toContain("cm-touch-selection-handle-inert");
    }
  });

  it("a long-press on an empty line opens the insertion menu", () => {
    const v = mount(DOC);
    const line = v.state.doc.line(4);
    const start = v.coordsAtPos(line.from)!;
    longPress(v, { x: start.left + 40, y: (start.top + start.bottom) / 2 });
    expect(v.state.selection.main.empty).toBe(true);
    expect(menuLabels()).toEqual(["Paste", "Select All", "⋮"]);
    expect(handleShown("cursor")).toBe(true);
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

  it("a drag between two taps makes them two single taps", () => {
    const v = mount(DOC);
    v.focus();
    const point = pointAt(v, 3, "world");
    tap(v, point);
    touch(v.scrollDOM, "touchstart", point);
    touch(v.scrollDOM, "touchmove", { x: point.x + 50, y: point.y });
    touch(v.scrollDOM, "touchend", { x: point.x + 50, y: point.y });
    tap(v, point);
    expect(v.state.selection.main.empty).toBe(true);
    expect(isContextMenuOpen(v)).toBe(false);
  });

  it("a tap on the caret handle opens the insertion menu, and a second tap closes it", () => {
    const v = mount(DOC);
    tap(v, pointAt(v, 3, "world"));
    expect(v.state.selection.main.empty).toBe(true);
    expect(handleShown("cursor")).toBe(true);
    const handle = v.dom.querySelector(".cm-touch-selection-handle-cursor")!;
    const point = { x: 0, y: 0 };
    touch(handle, "touchstart", point);
    touch(handle, "touchend", point);
    expect(menuLabels()).toEqual(["Paste", "Select All", "⋮"]);
    touch(handle, "touchstart", point);
    touch(handle, "touchend", point);
    expect(isContextMenuOpen(v)).toBe(false);
  });

  it("a scroll brings back only the menu it hid", async () => {
    const v = mount(DOC);
    v.focus();
    longPress(v, pointAt(v, 3, "world"));
    expect(isContextMenuOpen(v)).toBe(true);

    swipe(v, 240, 140);
    await vi.waitFor(() => expect(isContextMenuOpen(v)).toBe(true));

    hideContextMenu(v);
    swipe(v, 240, 140);
    for (let frame = 0; frame < 120; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(isContextMenuOpen(v)).toBe(false);
    }
  });

  it("typing during a scroll keeps the menu it hid closed", async () => {
    const v = mount(DOC);
    v.focus();
    longPress(v, pointAt(v, 3, "world"));
    expect(isContextMenuOpen(v)).toBe(true);

    const x = 200;
    touch(v.scrollDOM, "touchstart", { x, y: 240 });
    touch(v.scrollDOM, "touchmove", { x, y: 190 });
    expect(isContextMenuOpen(v)).toBe(false);
    const { from, to } = v.state.selection.main;
    v.dispatch({
      changes: { from, to, insert: "Z" },
      selection: { anchor: from + 1 },
      userEvent: "input.type",
    });
    touch(v.scrollDOM, "touchmove", { x, y: 140 });
    touch(v.scrollDOM, "touchend", { x, y: 140 });
    for (let frame = 0; frame < 120; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(isContextMenuOpen(v)).toBe(false);
    }
  });

  it("a scroll cut short by the view closing does not bring a menu into the next view", async () => {
    const first = mount(DOC);
    first.focus();
    longPress(first, pointAt(first, 3, "world"));
    expect(isContextMenuOpen(first)).toBe(true);
    touch(first.scrollDOM, "touchstart", { x: 200, y: 240 });
    touch(first.scrollDOM, "touchmove", { x: 200, y: 190 });
    first.destroy();

    const v = mount(DOC);
    v.focus();
    swipe(v, 240, 140);
    for (let frame = 0; frame < 120; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(isContextMenuOpen(v)).toBe(false);
    }
  });

  it("a cancelled scroll brings back the menu it hid", () => {
    const v = mount(DOC);
    v.focus();
    longPress(v, pointAt(v, 3, "world"));
    const x = 200;
    touch(v.scrollDOM, "touchstart", { x, y: 240 });
    touch(v.scrollDOM, "touchmove", { x, y: 190 });
    expect(isContextMenuOpen(v)).toBe(false);
    const cancel = new Event("touchcancel", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(cancel, "touches", { value: [] });
    v.scrollDOM.dispatchEvent(cancel);
    expect(isContextMenuOpen(v)).toBe(true);
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
