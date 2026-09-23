import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mobileViewportManager } from "../src/modules/script-editor/utils/extensions/mobileViewportManager";

// The manager marks the document root `keyboard-open` while the soft keyboard
// is up, and the web editor hides its bottom navigation on that class. The
// document outlives any one editor, so an editor that unmounts while the
// keyboard is open must leave the root unmarked.

const KEYBOARD_HEIGHT = 300;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const openKeyboard = async (view: EditorView) => {
  view.scrollDOM.dispatchEvent(new FocusEvent("focus"));
  await nextFrame();
};

describe("mobile viewport manager keyboard state", () => {
  let view: EditorView | undefined;

  beforeEach(() => {
    vi.stubGlobal("visualViewport", {
      height: window.innerHeight - KEYBOARD_HEIGHT,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const parent = document.createElement("div");
    document.body.append(parent);
    view = new EditorView({
      state: EditorState.create({
        doc: "Hello",
        extensions: mobileViewportManager({ isTouchEnvironment: () => true }),
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

  it("marks the root keyboard-open when the focused editor sees the keyboard", async () => {
    await openKeyboard(view!);

    expect(document.documentElement.classList.contains("keyboard-open")).toBe(
      true,
    );
  });

  it("clears the root when the editor is destroyed with the keyboard open", async () => {
    await openKeyboard(view!);
    expect(document.documentElement.classList.contains("keyboard-open")).toBe(
      true,
    );

    view!.destroy();
    view = undefined;

    expect(document.documentElement.classList.contains("keyboard-open")).toBe(
      false,
    );
    expect(document.body.style.height).toBe("");
  });

  it("does not mark the root from an open queued just before destruction", async () => {
    view!.scrollDOM.dispatchEvent(new FocusEvent("focus"));
    view!.destroy();
    view = undefined;
    await nextFrame();

    expect(document.documentElement.classList.contains("keyboard-open")).toBe(
      false,
    );
  });
});
