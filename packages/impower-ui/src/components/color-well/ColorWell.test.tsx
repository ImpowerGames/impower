import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ColorWell, { colorWellVariants } from "./ColorWell";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLInputElement>("input[type=color]")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("ColorWell", () => {
  it("wraps the device's own color input, named for screen readers, over a swatch of its value", async () => {
    const input = await mount(<ColorWell value="#ff8800" label="Pick any color" />);
    expect(input.type).toBe("color");
    expect(input.value).toBe("#ff8800");
    expect(input.getAttribute("aria-label")).toBe("Pick any color");
    const well = input.closest("label")!;
    expect(well.style.getPropertyValue("--swatch")).toBe("#ff8800");
    expect(well.querySelector("svg")).not.toBeNull();
  });

  it("reports each color the device's picker chooses", async () => {
    const onValueChange = vi.fn();
    const input = await mount(<ColorWell value="#ff8800" label="Pick" onValueChange={onValueChange} />);
    await act(async () => {
      input.value = "#00aaff";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith("#00aaff");
  });

  it("is 56px with a 12px radius, and 44px where the layout is compact or a phone", () => {
    const classes = colorWellVariants().split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(["size-14", "rounded-[12px]", "compact:size-11", "phone:size-11"]),
    );
  });
});
