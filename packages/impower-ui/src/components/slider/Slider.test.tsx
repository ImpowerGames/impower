import { render, type ComponentChild } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import Slider, { sliderVariants } from "./Slider";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLInputElement>('input[type="range"]')!;
};

const slide = async (control: HTMLInputElement, value: number) => {
  await act(async () => {
    control.value = String(value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const label = (value: number) => (value === 100 ? "Whole image" : `Top ${value}%`);

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("Slider", () => {
  it("is a native range input with its bounds, step and spoken value", async () => {
    const control = await mount(
      <Slider aria-label="Visible area" min={25} max={100} step={5} defaultValue={50} valueText={label} />,
    );
    expect([control.min, control.max, control.step, control.value]).toEqual(["25", "100", "5", "50"]);
    expect(control.getAttribute("aria-valuetext")).toBe("Top 50%");
  });

  it("moves itself when uncontrolled, reporting each value as a number and updating its spoken value", async () => {
    const onValueChange = vi.fn();
    const control = await mount(
      <Slider aria-label="Free" min={25} max={100} step={5} defaultValue={50} valueText={label} onValueChange={onValueChange} />,
    );
    await slide(control, 100);
    expect(control.value).toBe("100");
    expect(control.getAttribute("aria-valuetext")).toBe("Whole image");
    expect(onValueChange.mock.calls).toEqual([[100]]);
  });

  it("stays put when its owner refuses a value, and follows an owner that accepts it", async () => {
    const refused = await mount(<Slider aria-label="Fixed" value={40} onValueChange={() => {}} />);
    await slide(refused, 70);
    expect(refused.value).toBe("40");
    await act(async () => render(null, host!));
    host!.remove();

    function Owner() {
      const [value, setValue] = useState(50);
      return <Slider aria-label="Owned" value={value} valueText={label} onValueChange={setValue} />;
    }
    const owned = await mount(<Owner />);
    await slide(owned, 75);
    expect(owned.value).toBe("75");
    expect(owned.getAttribute("aria-valuetext")).toBe("Top 75%");
  });

  it("is a 44px target at full width unless a width is chosen, and merges a page's class", async () => {
    expect(sliderVariants()).toContain("min-h-11");
    expect(sliderVariants()).toContain("w-full");
    expect(sliderVariants({ width: "default" })).toContain("w-[180px]");
    const control = await mount(<Slider aria-label="Spaced" class="mt-2" disabled />);
    expect(control.className).toContain("mt-2");
    expect(control.disabled).toBe(true);
  });
});
