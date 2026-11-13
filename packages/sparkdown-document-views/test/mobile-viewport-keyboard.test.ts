import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isKeyboardToolbarOpen,
  keyboardToolbar,
} from "../src/modules/script-editor/utils/extensions/keyboardToolbar";
import { mobileViewportManager } from "../src/modules/script-editor/utils/extensions/mobileViewportManager";

const KEYBOARD_HEIGHT = 300;
const CLOSE_DELAY = 150;

let keyboardOpen = false;
let viewportListeners: Set<() => void>;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const visibleHeight = () =>
  window.innerHeight - (keyboardOpen ? KEYBOARD_HEIGHT : 0);

const setKeyboard = async (open: boolean) => {
  keyboardOpen = open;
  viewportListeners.forEach((listener) => listener());
  await nextFrame();
};

const focusEditor = async (view: EditorView) => {
  view.focus();
  view.scrollDOM.dispatchEvent(new FocusEvent("focus"));
  await nextFrame();
  await setKeyboard(true);
};

const rootFitted = () =>
  document.body.style.height === `${visibleHeight()}px` &&
  document.documentElement.classList.contains("keyboard-open");

const rootReleased = () =>
  document.body.style.height === "" &&
  !document.documentElement.classList.contains("keyboard-open");

describe("mobile viewport manager keyboard state", () => {
  let view: EditorView | undefined;

  beforeEach(() => {
    keyboardOpen = false;
    viewportListeners = new Set();
    vi.stubGlobal("visualViewport", {
      get height() {
        return visibleHeight();
      },
      offsetTop: 0,
      scale: 1,
      addEventListener: (_: string, listener: () => void) =>
        viewportListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        viewportListeners.delete(listener),
    });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const parent = document.createElement("div");
    document.body.append(parent);
    view = new EditorView({
      state: EditorState.create({
        doc: "Hello",
        extensions: [keyboardToolbar(), mobileViewportManager()],
      }),
      parent,
    });
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

  it("fits the root to the visible height and shows the toolbar when the focused editor sees the keyboard", async () => {
    await focusEditor(view!);

    expect(rootFitted()).toBe(true);
    expect(document.body.style.getPropertyValue("--keyboard-height")).toBe(
      `${KEYBOARD_HEIGHT}px`,
    );
    expect(isKeyboardToolbarOpen(view!.state)).toBe(true);
    expect(view!.dom.classList.contains("keyboard-open")).toBe(true);
  });

  it("keeps the root fitted when focus moves from the editor to a field outside it with the keyboard open", async () => {
    await focusEditor(view!);
    const field = document.body.appendChild(document.createElement("input"));

    view!.contentDOM.blur();
    field.focus();
    view!.scrollDOM.dispatchEvent(new FocusEvent("blur"));
    window.dispatchEvent(new FocusEvent("focusout"));
    await wait(CLOSE_DELAY + 50);
    await nextFrame();

    expect(document.activeElement).toBe(field);
    expect(rootFitted()).toBe(true);
    expect(isKeyboardToolbarOpen(view!.state)).toBe(false);
    expect(view!.dom.classList.contains("keyboard-open")).toBe(false);
  });

  it("releases the root and keeps the last keyboard height when the keyboard closes", async () => {
    await focusEditor(view!);

    await setKeyboard(false);

    expect(rootReleased()).toBe(true);
    expect(document.body.style.getPropertyValue("--keyboard-height")).toBe(
      `${KEYBOARD_HEIGHT}px`,
    );
    expect(isKeyboardToolbarOpen(view!.state)).toBe(false);
  });

  it("releases the root when the editor is destroyed", async () => {
    await focusEditor(view!);

    view!.destroy();
    view = undefined;

    expect(rootReleased()).toBe(true);
  });

  it("does not add the editor's own state when destroyed before a queued open lands", async () => {
    keyboardOpen = true;
    view!.scrollDOM.dispatchEvent(new FocusEvent("focus"));
    const dom = view!.dom;
    view!.destroy();
    view = undefined;
    await nextFrame();

    expect(dom.classList.contains("keyboard-open")).toBe(false);
    expect(rootReleased()).toBe(true);
  });
});
