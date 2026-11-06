import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  coarsePointer,
  contextMenu,
  isContextMenuOpen,
  showContextMenu,
} from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isKeyboardToolbarOpen,
  keyboardToolbar,
} from "../src/modules/script-editor/utils/extensions/keyboardToolbar";
import {
  setCoarsePointer,
  touchAffordances,
} from "../src/modules/script-editor/utils/extensions/touchAffordances";

const KEYBOARD_HEIGHT = 300;

let view: EditorView | undefined;
let keyboardOpen = false;
let viewportListeners: Set<() => void>;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const mount = (coarse: boolean) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: "Hello",
      extensions: [contextMenu(), keyboardToolbar(), touchAffordances(coarse)],
    }),
    parent,
  });
  return view;
};

const showKeyboard = async (v: EditorView) => {
  v.focus();
  keyboardOpen = true;
  viewportListeners.forEach((listener) => listener());
  v.scrollDOM.dispatchEvent(new FocusEvent("focus"));
  await nextFrame();
};

const handleCount = (v: EditorView) =>
  v.dom.querySelectorAll(".cm-touch-selection-handle").length;

const toolbarShown = (v: EditorView) =>
  isKeyboardToolbarOpen(v.state) &&
  v.dom.querySelector(".cm-keyboard-toolbar") !== null;

beforeEach(() => {
  keyboardOpen = false;
  viewportListeners = new Set();
  vi.stubGlobal("visualViewport", {
    get height() {
      return window.innerHeight - (keyboardOpen ? KEYBOARD_HEIGHT : 0);
    },
    addEventListener: (_: string, listener: () => void) =>
      viewportListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      viewportListeners.delete(listener),
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.documentElement.classList.remove("keyboard-open");
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the editor's coarse-pointer option", () => {
  it("shows the keyboard toolbar and touch selection handles when the pointer is coarse", async () => {
    const v = mount(true);
    expect(v.state.facet(coarsePointer)).toBe(true);
    expect(handleCount(v)).toBe(3);
    await showKeyboard(v);
    expect(toolbarShown(v)).toBe(true);
  });

  it("keeps the toolbar and touch handling off for a fine pointer, whatever the device reports", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      maxTouchPoints: 10,
    });
    const v = mount(false);
    expect(v.state.facet(coarsePointer)).toBe(false);
    await showKeyboard(v);
    expect(toolbarShown(v)).toBe(false);
    expect(handleCount(v)).toBe(0);
  });

  it("switches the toolbar and touch selection handles on and off when the option changes", async () => {
    const v = mount(false);
    await showKeyboard(v);
    expect(toolbarShown(v)).toBe(false);
    expect(handleCount(v)).toBe(0);

    setCoarsePointer(v, true);
    expect(v.state.facet(coarsePointer)).toBe(true);
    expect(handleCount(v)).toBe(3);
    await showKeyboard(v);
    expect(toolbarShown(v)).toBe(true);

    setCoarsePointer(v, false);
    expect(v.state.facet(coarsePointer)).toBe(false);
    expect(handleCount(v)).toBe(0);
    expect(toolbarShown(v)).toBe(false);
    expect(v.dom.classList.contains("keyboard-open")).toBe(false);
    await showKeyboard(v);
    expect(toolbarShown(v)).toBe(false);
  });

  it.each([false, true])(
    "closes a context menu opened for one pointer when the pointer changes (coarse: %s)",
    (coarse) => {
      const v = mount(coarse);
      showContextMenu(v, { pos: 0, end: 5, x: 10, y: 10 });
      expect(isContextMenuOpen(v)).toBe(true);
      expect(document.querySelector(".cm-context-menu")).not.toBeNull();

      setCoarsePointer(v, !coarse);
      expect(isContextMenuOpen(v)).toBe(false);
      expect(document.querySelector(".cm-context-menu")).toBeNull();
    },
  );
});
