import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardFit } from "../../src/hooks/useKeyboardFit";
import { fitToKeyboard, keyboard, KEYBOARD_MIN_HEIGHT } from "../../src/layout/keyboard";

const KEYBOARD_HEIGHT = 320;

let keyboardOpen = false;
let keyboardGrowth = 0;
let offsetTop = 0;
let scale = 1;
let viewportListeners: Map<string, Set<() => void>>;
let releases: (() => void)[] = [];

const hold = (...args: Parameters<typeof fitToKeyboard>) => {
  const release = fitToKeyboard(...args);
  releases.push(release);
  return release;
};

const visibleHeight = () =>
  window.innerHeight - (keyboardOpen ? KEYBOARD_HEIGHT + keyboardGrowth : 0);

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
  keyboardGrowth = 0;
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
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  document.body.appendChild(document.createElement("textarea")).focus();
});

afterEach(() => {
  releases.forEach((release) => release());
  releases = [];
  document.documentElement.classList.remove("keyboard-open");
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fitting the root to the on-screen keyboard", () => {
  it("sizes the root to the visible height while the keyboard is open, whichever field has focus", () => {
    const release = hold();
    const field = document.body.appendChild(document.createElement("input"));
    field.focus();

    setKeyboard(true);

    expect(rootFitted()).toBe(true);
    expect(document.body.style.getPropertyValue("--keyboard-height")).toBe(
      `${KEYBOARD_HEIGHT}px`,
    );
    expect(keyboard()).toEqual({
      open: true,
      height: KEYBOARD_HEIGHT,
      visibleHeight: window.innerHeight - KEYBOARD_HEIGHT,
    });
    release();
  });

  it("releases the root as soon as no field has focus, before the viewport reports the keyboard leaving", () => {
    const seen: boolean[] = [];
    const release = hold((next) => seen.push(next.open));
    const field = document.body.appendChild(document.createElement("input"));
    field.focus();
    setKeyboard(true);

    field.blur();

    expect(visibleHeight()).toBe(window.innerHeight - KEYBOARD_HEIGHT);
    expect(rootReleased()).toBe(true);
    expect(document.body.style.getPropertyValue("--keyboard-height")).toBe(
      `${KEYBOARD_HEIGHT}px`,
    );
    expect(keyboard().open).toBe(false);
    expect(seen).toEqual([true, false]);

    emit("scroll");
    expect(rootReleased()).toBe(true);

    field.focus();
    expect(rootFitted()).toBe(true);
    release();
  });

  it("keeps the root fitted when focus moves straight from one field to another", () => {
    const release = hold();
    const first = document.body.appendChild(document.createElement("input"));
    const second = document.body.appendChild(document.createElement("input"));
    first.focus();
    setKeyboard(true);

    second.focus();

    expect(rootFitted()).toBe(true);
    expect(keyboard().open).toBe(true);
    release();
  });

  it("restores the root when the keyboard closes and keeps the last keyboard height", () => {
    const release = hold();
    setKeyboard(true);

    setKeyboard(false);

    expect(rootReleased()).toBe(true);
    expect(document.body.style.getPropertyValue("--keyboard-height")).toBe(
      `${KEYBOARD_HEIGHT}px`,
    );
    expect(keyboard()).toEqual({ open: false, height: 0 });
    release();
  });

  it("asks the page to scroll back to the top and keeps the root under a pan it cannot undo", () => {
    const release = hold();
    setKeyboard(true);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.body.style.transform).toBe("");

    offsetTop = 112;
    emit("scroll");

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(rootFitted()).toBe(true);
    expect(document.body.style.transform).toBe("translateY(112px)");

    offsetTop = 0;
    emit("scroll");
    expect(document.body.style.transform).toBe("");

    offsetTop = 112;
    emit("scroll");
    setKeyboard(false);
    expect(rootReleased()).toBe(true);
    expect(document.body.style.transform).toBe("");
    release();
  });

  it("measures the keyboard when the browser shrinks the layout viewport with it", () => {
    const full = window.innerHeight;
    const release = hold();
    const host = document.body.appendChild(document.createElement("div"));
    const editable = host
      .attachShadow({ mode: "open" })
      .appendChild(document.createElement("div"));
    editable.setAttribute("contenteditable", "true");
    editable.tabIndex = 0;
    editable.focus();
    vi.stubGlobal("innerHeight", full - KEYBOARD_HEIGHT);
    emit("resize");

    expect(keyboard()).toEqual({
      open: true,
      height: KEYBOARD_HEIGHT,
      visibleHeight: full - KEYBOARD_HEIGHT,
    });
    expect(document.body.style.height).toBe(`${full - KEYBOARD_HEIGHT}px`);
    expect(document.documentElement.classList.contains("keyboard-open")).toBe(
      true,
    );

    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    expect(keyboard().open).toBe(false);
    expect(rootReleased()).toBe(true);
    vi.stubGlobal("innerHeight", full - KEYBOARD_HEIGHT + 48);
    emit("resize");
    editable.focus();
    expect(keyboard()).toEqual({
      open: true,
      height: KEYBOARD_HEIGHT - 48,
      visibleHeight: full - KEYBOARD_HEIGHT + 48,
    });
    vi.stubGlobal("innerHeight", full - KEYBOARD_HEIGHT - 48);
    emit("resize");
    expect(keyboard()).toEqual({
      open: true,
      height: KEYBOARD_HEIGHT + 48,
      visibleHeight: full - KEYBOARD_HEIGHT - 48,
    });

    vi.stubGlobal("innerHeight", full);
    emit("resize");
    expect(rootReleased()).toBe(true);
    release();
  });

  it("treats a shorter window at the same width as no keyboard while no field has focus", () => {
    const full = window.innerHeight;
    (document.activeElement as HTMLElement).blur();
    const release = hold();
    vi.stubGlobal("innerHeight", full - KEYBOARD_HEIGHT);
    emit("resize");
    document.body.appendChild(document.createElement("input")).focus();

    expect(keyboard().open).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(rootReleased()).toBe(true);
    release();
  });

  it("ignores a change in height smaller than a keyboard", () => {
    const full = window.innerHeight;
    const release = hold();
    vi.stubGlobal("innerHeight", full - KEYBOARD_MIN_HEIGHT);
    emit("resize");

    expect(keyboard().open).toBe(false);
    expect(rootReleased()).toBe(true);
    release();
  });

  it("measures from the new full height after the width changes", () => {
    const width = window.innerWidth;
    const release = hold();
    vi.stubGlobal("innerWidth", window.innerHeight);
    vi.stubGlobal("innerHeight", width / 2);
    emit("resize");

    expect(keyboard().open).toBe(false);
    expect(rootReleased()).toBe(true);
    release();
  });

  it("treats a pinch zoom as no keyboard", () => {
    const release = hold();
    scale = 2;

    setKeyboard(true);

    expect(rootReleased()).toBe(true);
    expect(keyboard().open).toBe(false);
    release();
  });

  it("tells each holder when the keyboard opens, changes height or closes", () => {
    const seen: string[] = [];
    const release = hold((next) =>
      seen.push(`${next.open}:${next.height}`),
    );

    setKeyboard(true);
    emit("scroll");
    keyboardGrowth = 48;
    emit("resize");
    emit("scroll");
    setKeyboard(false);

    expect(seen).toEqual([
      `true:${KEYBOARD_HEIGHT}`,
      `true:${KEYBOARD_HEIGHT + 48}`,
      "false:0",
    ]);
    release();
  });

  it("tells each holder the height left above the keyboard, also when only that changes", () => {
    const portrait = { width: window.innerWidth, height: window.innerHeight };
    const seen: (number | undefined)[] = [];
    const release = hold((next) =>
      seen.push(next.open ? next.visibleHeight : undefined),
    );

    setKeyboard(true);
    vi.stubGlobal("innerWidth", portrait.height);
    vi.stubGlobal("innerHeight", portrait.width);
    emit("resize");
    vi.stubGlobal("innerWidth", portrait.width);
    vi.stubGlobal("innerHeight", portrait.height);
    emit("resize");

    expect(seen).toEqual([
      portrait.height - KEYBOARD_HEIGHT,
      portrait.width - KEYBOARD_HEIGHT,
      portrait.height - KEYBOARD_HEIGHT,
    ]);
    release();
  });

  it("follows the keyboard while any holder remains and stops after the last one releases", () => {
    const first = hold();
    const second = hold();
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
