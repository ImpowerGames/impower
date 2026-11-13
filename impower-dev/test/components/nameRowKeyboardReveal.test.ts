import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NameRow } from "../../src/modules/spark-editor/components/library-page";

const LIST_TOP = 271;
const CONTENT_HEIGHT = 400;
const FIELD_OFFSET = 88;
const FIELD_HEIGHT = 26;
const MESSAGE_GAP = 4;
const MESSAGE_HEIGHT = 12;

let host: HTMLDivElement | undefined;
let visibleHeight = 0;
let scrollTop = 0;
let viewportListeners: Map<string, Set<() => void>>;

const listHeight = () => visibleHeight - LIST_TOP;

const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top }) as DOMRect;

const setVisibleHeight = async (height: number) => {
  visibleHeight = height;
  await act(async () => viewportListeners.get("resize")?.forEach((listener) => listener()));
};

beforeEach(() => {
  visibleHeight = window.innerHeight;
  scrollTop = 0;
  viewportListeners = new Map();
  vi.stubGlobal("visualViewport", {
    get height() {
      return visibleHeight;
    },
    offsetTop: 0,
    scale: 1,
    addEventListener: (type: string, listener: () => void) => {
      if (!viewportListeners.has(type)) viewportListeners.set(type, new Set());
      viewportListeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) =>
      viewportListeners.get(type)?.delete(listener),
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = async (onCommit: (name: string) => Promise<void> = async () => {}) => {
  host = document.body.appendChild(document.createElement("div"));
  const list = host.appendChild(document.createElement("div"));
  list.style.overflowY = "auto";
  Object.defineProperties(list, {
    clientHeight: { get: listHeight },
    scrollHeight: { get: () => CONTENT_HEIGHT },
    scrollTop: {
      get: () => scrollTop,
      set: (next: number) => {
        scrollTop = Math.max(0, Math.min(CONTENT_HEIGHT - listHeight(), next));
      },
    },
  });
  const layout = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const fieldTop = LIST_TOP + FIELD_OFFSET - scrollTop;
    if (this === list) return rect(LIST_TOP, listHeight());
    if (this.querySelector(":scope > input")) return rect(fieldTop, FIELD_HEIGHT);
    if (this.getAttribute("role") === "alert") {
      return rect(fieldTop + FIELD_HEIGHT + MESSAGE_GAP, MESSAGE_HEIGHT);
    }
    return layout.call(this);
  });
  await act(async () =>
    render(
      h(NameRow, {
        icon: null,
        label: "Rename chapter",
        initial: "chapter",
        suffix: ".sd",
        onCommit,
        onCancel: () => {},
      }),
      list,
    ),
  );
  const input = list.querySelector("input")!;
  expect(document.activeElement).toBe(input);
  return {
    input,
    field: () => input.parentElement!.getBoundingClientRect(),
    message: () => list.querySelector('[role="alert"]')?.getBoundingClientRect(),
    list: () => list.getBoundingClientRect(),
  };
};

const refuse = async (input: HTMLInputElement) => {
  await act(async () => {
    input.value = "intro";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

const inside = (inner: DOMRect, outer: DOMRect) =>
  inner.top >= outer.top && inner.bottom <= outer.bottom;

describe("an inline name field with the keyboard up", () => {
  it("scrolls its list to keep the focused field in view, 8 px from the edge, each time the keyboard leaves less room", async () => {
    const { field, list } = await mount();
    await setVisibleHeight(447);
    expect(scrollTop).toBe(0);
    expect(inside(field(), list())).toBe(true);
    await setVisibleHeight(319);
    expect(field().bottom).toBe(list().bottom - 8);
    await setVisibleHeight(300);
    expect(inside(field(), list())).toBe(true);
  });

  it("keeps the field and its refusal message in view together, giving up margin before either", async () => {
    const { input, field, message, list } = await mount(async () => {
      throw new Error("That name is already in use in this folder.");
    });
    await setVisibleHeight(319);
    await refuse(input);
    expect(host!.querySelector('[role="alert"]')!.textContent).toBe(
      "That name is already in use in this folder.",
    );
    expect(inside(field(), list())).toBe(true);
    expect(inside(message()!, list())).toBe(true);
  });

  it("keeps the whole field in view when the field and its message cannot both fit", async () => {
    const { input, field, list } = await mount(async () => {
      throw new Error("That name is already in use in this folder.");
    });
    await setVisibleHeight(319);
    await refuse(input);
    await setVisibleHeight(LIST_TOP + FIELD_HEIGHT + 4);
    expect(inside(field(), list())).toBe(true);
  });

  it("leaves the list where it is once the field no longer has focus", async () => {
    const { input } = await mount();
    const elsewhere = document.body.appendChild(document.createElement("button"));
    await act(async () => {
      elsewhere.focus();
    });
    expect(document.activeElement).not.toBe(input);
    await setVisibleHeight(319);
    expect(scrollTop).toBe(0);
    elsewhere.remove();
  });
});
