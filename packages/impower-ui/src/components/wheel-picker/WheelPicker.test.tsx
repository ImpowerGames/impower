import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WHEEL_ROW, WheelPicker, WheelSheet, wheelIndexAt, type WheelOption } from "./WheelPicker";

const OPTIONS: WheelOption[] = [
  { value: "", label: "As is", hint: "Default" },
  { value: "happy", label: "Happy" },
  { value: "sad", label: "Sad" },
  { value: "cross", label: "Cross" },
  { value: "sleepy", label: "Sleepy" },
  { value: "shy", label: "Shy" },
  { value: "proud", label: "Proud" },
];

let host: HTMLDivElement | undefined;
const SCROLL_TOP = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
const SCROLL_TO = Element.prototype.scrollTo;
const scrolled: { top: number; behavior: string }[] = [];

beforeEach(() => {
  scrolled.length = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 1;
  });
  const tops = new WeakMap<Element, number>();
  const land = (element: Element, top: number, behavior: string) => {
    scrolled.push({ top, behavior });
    tops.set(element, top);
    element.dispatchEvent(new Event("scroll"));
  };
  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    get(this: Element) {
      return tops.get(this) ?? 0;
    },
    set(this: Element, top: number) {
      land(this, top, "auto");
    },
  });
  Element.prototype.scrollTo = function (this: Element, options: ScrollToOptions) {
    land(this, options.top ?? 0, String(options.behavior));
  } as Element["scrollTo"];
});

afterEach(async () => {
  Object.defineProperty(Element.prototype, "scrollTop", SCROLL_TOP);
  Element.prototype.scrollTo = SCROLL_TO;
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const mount = async (node: preact.ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return document.querySelector<HTMLElement>("[role=listbox]")!;
};

const key = async (element: HTMLElement, name: string) =>
  act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });

const centred = (list: HTMLElement) =>
  document.getElementById(list.getAttribute("aria-activedescendant")!)!.textContent;

describe("wheelIndexAt", () => {
  it("snaps to the row nearest the centre and stays inside the list", () => {
    expect(wheelIndexAt(0, 7)).toBe(0);
    expect(wheelIndexAt(WHEEL_ROW * 0.49, 7)).toBe(0);
    expect(wheelIndexAt(WHEEL_ROW * 0.51, 7)).toBe(1);
    expect(wheelIndexAt(WHEEL_ROW * 3, 7)).toBe(3);
    expect(wheelIndexAt(WHEEL_ROW * 40, 7)).toBe(6);
    expect(wheelIndexAt(-30, 7)).toBe(0);
  });
});

describe("WheelPicker", () => {
  it("is a listbox whose centred row is its active option, starting at the chosen value", async () => {
    const list = await mount(<WheelPicker label="Face" options={OPTIONS} value="sad" onChoose={() => {}} />);
    expect(list.getAttribute("aria-label")).toBe("Face");
    expect(list.tabIndex).toBe(0);
    expect(list.querySelectorAll("[role=option]")).toHaveLength(7);
    expect(scrolled[0]).toEqual({ top: 2 * WHEEL_ROW, behavior: "auto" });
    expect(centred(list)).toContain("Sad");
    expect(list.querySelector("[aria-selected=true]")!.textContent).toContain("Sad");
  });

  it("previews each row as it reaches the centre and turns by the keys of a listbox", async () => {
    const previewed: string[] = [];
    const list = await mount(
      <WheelPicker label="Face" options={OPTIONS} value="" onCentre={(value) => previewed.push(value)} onChoose={() => {}} />,
    );
    await key(list, "ArrowDown");
    await key(list, "ArrowDown");
    await key(list, "ArrowUp");
    expect(previewed).toEqual(["happy", "sad", "happy"]);
    await key(list, "PageDown");
    expect(centred(list)).toContain("Shy");
    await key(list, "End");
    expect(centred(list)).toContain("Proud");
    await key(list, "Home");
    expect(centred(list)).toContain("As is");
    expect(scrolled.every((scroll) => scroll.behavior === "auto")).toBe(true);
  });

  it("chooses the centred row with Enter or a tap, and turns to another row tapped", async () => {
    const chosen: string[] = [];
    const list = await mount(<WheelPicker label="Face" options={OPTIONS} value="happy" onChoose={(value) => chosen.push(value)} />);
    await key(list, "Enter");
    await act(async () => list.querySelector<HTMLElement>("[data-wheel-index='4']")!.click());
    expect(centred(list)).toContain("Sleepy");
    await act(async () => list.querySelector<HTMLElement>("[data-wheel-index='4']")!.click());
    expect(chosen).toEqual(["happy", "sleepy"]);
  });

  it("turns to a tapped row smoothly, and at once when reduced motion is asked for", async () => {
    const reduce = (matches: boolean) =>
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: matches && query.includes("reduce"), media: query }));
    reduce(false);
    const list = await mount(<WheelPicker label="Face" options={OPTIONS} value="" onChoose={() => {}} />);
    await act(async () => list.querySelector<HTMLElement>("[data-wheel-index='3']")!.click());
    expect(scrolled.at(-1)).toEqual({ top: 3 * WHEEL_ROW, behavior: "smooth" });
    reduce(true);
    await act(async () => list.querySelector<HTMLElement>("[data-wheel-index='1']")!.click());
    expect(scrolled.at(-1)).toEqual({ top: 1 * WHEEL_ROW, behavior: "auto" });
  });
});

describe("WheelSheet", () => {
  it("opens on its wheel, previews while spinning, and chooses with Done", async () => {
    const previewed: string[] = [];
    const chosen: string[] = [];
    const list = await mount(
      <WheelSheet
        open
        title="Face"
        options={OPTIONS}
        value=""
        onPreview={(value) => previewed.push(value)}
        onChoose={(value) => chosen.push(value)}
        onCancel={() => chosen.push("cancelled")}
      />,
    );
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    expect(document.activeElement).toBe(list);
    await key(list, "ArrowDown");
    const done = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Done")!;
    await act(async () => done.click());
    expect(previewed).toEqual(["happy"]);
    expect(chosen).toEqual(["happy"]);
  });

  it("cancels with Cancel or Escape", async () => {
    const cancelled = vi.fn();
    await mount(<WheelSheet open title="Face" options={OPTIONS} value="" onChoose={() => {}} onCancel={cancelled} />);
    const cancel = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Cancel")!;
    await act(async () => cancel.click());
    await act(async () => {
      document.querySelector("[role=dialog]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(cancelled).toHaveBeenCalledTimes(2);
  });
});
