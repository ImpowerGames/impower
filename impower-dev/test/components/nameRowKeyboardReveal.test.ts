import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NameRow } from "../../src/modules/spark-editor/components/library-page";

let host: HTMLDivElement | undefined;
let visibleHeight = 783;
let viewportListeners: Map<string, Set<() => void>>;
let revealed: Element[];

const setVisibleHeight = async (height: number) => {
  visibleHeight = height;
  await act(async () => viewportListeners.get("resize")?.forEach((listener) => listener()));
};

beforeEach(() => {
  visibleHeight = window.innerHeight;
  viewportListeners = new Map();
  revealed = [];
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
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
    revealed.push(this);
  });
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
  await act(async () =>
    render(
      h(NameRow, {
        icon: null,
        label: "New script name",
        suffix: ".sd",
        onCommit,
        onCancel: () => {},
      }),
      host!,
    ),
  );
  const input = host.querySelector("input")!;
  expect(document.activeElement).toBe(input);
  revealed = [];
  return { input, box: input.parentElement! };
};

describe("an inline name field with the keyboard up", () => {
  it("brings its focused field back into view each time the keyboard leaves less room", async () => {
    const { box } = await mount();
    await setVisibleHeight(447);
    expect(revealed).toEqual([box]);
    await setVisibleHeight(319);
    expect(revealed).toEqual([box, box]);
  });

  it("brings its message into view below the field when one appears", async () => {
    const { input, box } = await mount(async () => {
      throw new Error("That name is already in use in this folder.");
    });
    await setVisibleHeight(319);
    revealed = [];
    await act(async () => {
      input.value = "intro";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const message = host!.querySelector('[role="alert"]')!;
    expect(message.textContent).toBe("That name is already in use in this folder.");
    expect(revealed).toEqual([box, message]);
    revealed = [];
    await setVisibleHeight(250);
    expect(revealed).toEqual([box, message]);
  });

  it("leaves the page where it is once the field no longer has focus", async () => {
    const { input } = await mount();
    const elsewhere = document.body.appendChild(document.createElement("button"));
    await act(async () => {
      elsewhere.focus();
    });
    expect(document.activeElement).not.toBe(input);
    revealed = [];
    await setVisibleHeight(319);
    expect(revealed).toEqual([]);
    elsewhere.remove();
  });
});
