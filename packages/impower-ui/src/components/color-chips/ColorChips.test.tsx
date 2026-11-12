import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ColorChips from "./ColorChips";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const COLORS = ["#ff0000", "#00ff00", "#0000ff"];

describe("ColorChips", () => {
  it("draws a named group with one chip per color, in order, each named by its value", async () => {
    const root = await mount(
      <ColorChips label="Colors in this story" colors={COLORS} onSelect={() => {}} />,
    );
    const group = root.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("Colors in this story");
    const chips = Array.from(group.querySelectorAll("button"));
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual(COLORS);
    expect(chips.map((chip) => chip.style.getPropertyValue("--swatch"))).toEqual(COLORS);
  });

  it("becomes a sideways scroller-x row in the compact and phone layouts, so a swipe starting on a chip pans it", async () => {
    const root = await mount(<ColorChips label="Colors" colors={COLORS} onSelect={() => {}} />);
    const group = root.querySelector('[role="group"]')!;
    expect(Array.from(group.classList).filter((name) => /scroller-x|overflow-x-/.test(name))).toEqual([
      "compact:scroller-x",
      "phone:scroller-x",
    ]);
    for (const el of [group, ...Array.from(group.querySelectorAll("*"))]) {
      expect(Array.from(el.classList).filter((name) => /(^|:)touch-/.test(name))).toEqual([]);
    }
  });

  it("marks the current color pressed and the rest not", async () => {
    const root = await mount(
      <ColorChips label="Colors" colors={COLORS} current="#00ff00" onSelect={() => {}} />,
    );
    const pressed = Array.from(root.querySelectorAll("button")).map((chip) =>
      chip.getAttribute("aria-pressed"),
    );
    expect(pressed).toEqual(["false", "true", "false"]);
  });

  it("reports the chip pressed", async () => {
    const onSelect = vi.fn();
    const root = await mount(<ColorChips label="Colors" colors={COLORS} onSelect={onSelect} />);
    await act(async () => root.querySelectorAll("button")[2]!.click());
    expect(onSelect).toHaveBeenCalledWith("#0000ff");
  });
});
