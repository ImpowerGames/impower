import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardFit } from "../hooks/useKeyboardFit";
import { fitToKeyboard, keyboard, KEYBOARD_MIN_HEIGHT } from "./keyboard";

const KEYBOARD_HEIGHT = 320;

let keyboardOpen = false;
let offsetTop = 0;
let scale = 1;
let viewportListeners: Map<string, Set<() => void>>;

const visibleHeight = () =>
  window.innerHeight - (keyboardOpen ? KEYBOARD_HEIGHT : 0);

const emit = (type: "resize" | "scroll") =>
  viewportListeners.get(type)?.forEach((listener) => listener());

const setKeyboard = (open: boolean) => {
  keyboardOpen = open;
  emit("resize");
};

const rootFitted = () =>
  document.body.style.height === `${visibleHeight()}px` &&
  document.documentElement.classList.contains("keyboard-open");

const rootReleased = () =>
  document.body.style.height === "" &&
  !document.documentElement.classList.contains("keyboard-open");

beforeEach(() => {
  keyboardOpen = false;
  offsetTop = 0;
  scale = 1;
  viewportListeners = new Map();
  vi.stubGlobal("visualViewport", {
    get height() {
      return visibleHeight();
    },
    get offsetTop() {
      return offsetTop;
    },
    get scale() {
      return scale;
    },
    addEventListener: (type: string, listener: () => void) => {
      if (!viewportListeners.has(type)) viewportListeners.set(type, new Set());
      viewportListeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) =>
      viewportListeners.get(type)?.delete(listener),
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {
    offsetTop = 0;
  });
});

afterEach(() => {
  document.documentElement.classList.remove("keyboard-open");
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fitting the root to the on-screen keyboard", () => {
  it("sizes the root to the visible height whenever the keyboard is open, whatever has focus", () => {
    const release = fitToKeyboard();
    const field = document.body.appendChild(document.createElement("input"));
    field.focus();

    setKeyboard(true);

    expect(rootFitted()).toBe(true);
    expect(document.body.style.getPropertyValue("--keyboard-height")).toBe(
      `${KEYBOARD_HEIGHT}px`,
    );
    expect(keyboard()).toEqual({ open: true, height: KEYBOARD_HEIGHT });

    field.blur();
    emit("resize");
    expect(rootFitted()).toBe(true);
    release();
  });

  it("restores the root when the keyboard closes and keeps the last keyboard height", () => {
    const release = fitToKeyboard();
    setKeyboard(true);

    setKeyboard(false);

    expect(rootReleased()).toBe(true);
    expect(document.body.style.getPropertyValue("--keyboard-height")).toBe(
      `${KEYBOARD_HEIGHT}px`,
    );
    expect(keyboard()).toEqual({ open: false, height: 0 });
    release();
  });

  it("pans the page back to the top when the browser scrolls it to reveal a field", () => {
    const release = fitToKeyboard();
    setKeyboard(true);

    offsetTop = 112;
    emit("scroll");

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(offsetTop).toBe(0);
    expect(rootFitted()).toBe(true);
    release();
  });

  it("measures the keyboard when the browser shrinks the layout viewport with it", () => {
    const full = window.innerHeight;
    const release = fitToKeyboard();
    const host = document.body.appendChild(document.createElement("div"));
    const editable = host
      .attachShadow({ mode: "open" })
      .appendChild(document.createElement("div"));
    editable.setAttribute("contenteditable", "true");
    editable.tabIndex = 0;
    editable.focus();
    vi.stubGlobal("innerHeight", full - KEYBOARD_HEIGHT);
    emit("resize");

    expect(keyboard()).toEqual({ open: true, height: KEYBOARD_HEIGHT });
    expect(document.body.style.height).toBe(`${full - KEYBOARD_HEIGHT}px`);
    expect(document.documentElement.classList.contains("keyboard-open")).toBe(
      true,
    );

    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    expect(keyboard().open).toBe(true);

    vi.stubGlobal("innerHeight", full);
    emit("resize");
    expect(rootReleased()).toBe(true);
    release();
  });

  it("treats a shorter window at the same width as no keyboard while no field has focus", () => {
    const full = window.innerHeight;
    const release = fitToKeyboard();
    vi.stubGlobal("innerHeight", full - KEYBOARD_HEIGHT);
    emit("resize");

    expect(document.activeElement).toBe(document.body);
    expect(keyboard().open).toBe(false);
    expect(rootReleased()).toBe(true);
    release();
  });

  it("ignores a change in height smaller than a keyboard", () => {
    const full = window.innerHeight;
    const release = fitToKeyboard();
    vi.stubGlobal("innerHeight", full - KEYBOARD_MIN_HEIGHT);
    emit("resize");

    expect(keyboard().open).toBe(false);
    expect(rootReleased()).toBe(true);
    release();
  });

  it("measures from the new full height after the width changes", () => {
    const width = window.innerWidth;
    const release = fitToKeyboard();
    vi.stubGlobal("innerWidth", window.innerHeight);
    vi.stubGlobal("innerHeight", width / 2);
    emit("resize");

    expect(keyboard().open).toBe(false);
    expect(rootReleased()).toBe(true);
    release();
  });

  it("treats a pinch zoom as no keyboard", () => {
    const release = fitToKeyboard();
    scale = 2;

    setKeyboard(true);

    expect(rootReleased()).toBe(true);
    expect(keyboard().open).toBe(false);
    release();
  });

  it("tells each holder when the keyboard opens, changes height or closes", () => {
    const seen: string[] = [];
    const release = fitToKeyboard((next) =>
      seen.push(`${next.open}:${next.height}`),
    );

    setKeyboard(true);
    emit("scroll");
    setKeyboard(false);

    expect(seen).toEqual([`true:${KEYBOARD_HEIGHT}`, "false:0"]);
    release();
  });

  it("follows the keyboard while any holder remains and stops after the last one releases", () => {
    const first = fitToKeyboard();
    const second = fitToKeyboard();
    setKeyboard(true);

    first();
    expect(rootFitted()).toBe(true);

    second();
    expect(rootReleased()).toBe(true);
    expect(viewportListeners.get("resize")?.size ?? 0).toBe(0);
    expect(viewportListeners.get("scroll")?.size ?? 0).toBe(0);

    setKeyboard(true);
    expect(rootReleased()).toBe(true);
  });

  it("holds the fit while a component using the hook is mounted and enabled", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    function Shell({ enabled }: { enabled: boolean }) {
      useKeyboardFit(enabled);
      return null;
    }

    await act(async () => render(<Shell enabled={false} />, host));
    setKeyboard(true);
    expect(rootReleased()).toBe(true);

    await act(async () => render(<Shell enabled />, host));
    expect(rootFitted()).toBe(true);

    await act(async () => render(null, host));
    expect(rootReleased()).toBe(true);
  });
});
