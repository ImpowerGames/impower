import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const { ChangeColorView } = await import(
  "../../src/modules/spark-editor/components/writing-tools/ChangeColor"
);

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

const ORANGE = { red: 1, green: 136 / 255, blue: 0, alpha: 1 };

const mount = async (
  value: string,
  colors: string[] = [],
  onUse = vi.fn(async () => "applied" as const),
  canEdit = true,
) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(h(ChangeColorView, { value, color: ORANGE, colors, onUse, canEdit }), host!),
  );
  return { onUse };
};

const field = () => document.querySelector<HTMLInputElement>('input[type="text"]')!;
const picker = () => document.querySelector<HTMLInputElement>('input[type="color"]')!;
const slider = () => document.querySelector<HTMLInputElement>('input[type="range"]')!;
const chip = (color: string) =>
  document.querySelector<HTMLButtonElement>(`button[data-color="${color}"]`)!;
const status = () => document.querySelector('[role="status"]')!;

const input = async (element: HTMLInputElement, value: string) => {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const use = async () => {
  await act(async () => {
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

describe("the Change color view", () => {
  it("shows the value as the script wrote it, its color on the swatch and its opacity", async () => {
    await mount("#ff880080");
    expect(field().value).toBe("#ff880080");
    expect(picker().value).toBe("#ff8800");
    expect(slider().value).toBe("50");
    expect(slider().getAttribute("aria-valuetext")).toBe("50%");
  });

  it("writes the alpha digits from the slider and leaves the color", async () => {
    const { onUse } = await mount("#ff8800");
    await input(slider(), "50");
    expect(field().value).toBe("#ff880080");
    expect(slider().getAttribute("aria-valuetext")).toBe("50%");
    await use();
    expect(onUse).toHaveBeenCalledWith("#ff880080");
  });

  it("keeps the opacity when the device's picker chooses another color", async () => {
    const { onUse } = await mount("#ff8800");
    await input(slider(), "50");
    await input(picker(), "#00aaff");
    expect(field().value).toBe("#00aaff80");
    await use();
    expect(onUse).toHaveBeenCalledWith("#00aaff80");
  });

  it("keeps the opacity when a chip sets the color, and marks the current chip", async () => {
    await mount("#ff880080", ["#ff8800", "#123456"]);
    expect(chip("#ff8800").getAttribute("aria-pressed")).toBe("true");
    await act(async () => chip("#123456").click());
    expect(field().value).toBe("#12345680");
    expect(chip("#123456").getAttribute("aria-pressed")).toBe("true");
    expect(chip("#ff8800").getAttribute("aria-pressed")).toBe("false");
  });

  it("sets both color and opacity from a typed value and applies it in the script's form", async () => {
    const { onUse } = await mount("#ff8800");
    await input(field(), "#abc8");
    expect(picker().value).toBe("#aabbcc");
    expect(slider().value).toBe("53");
    await input(field(), "#abc");
    await use();
    expect(onUse).toHaveBeenCalledWith("#aabbcc");
  });

  it("refuses a value that is not a color and says why", async () => {
    const { onUse } = await mount("#ff8800");
    await input(field(), "blue");
    await use();
    expect(onUse).not.toHaveBeenCalled();
    expect(status().textContent).toMatch(/#f2c14e/);
    expect(document.activeElement).toBe(field());
  });

  it("holds Use color back and says why while the script cannot be edited", async () => {
    const { onUse } = await mount("#ff8800", [], undefined, false);
    const button = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(true);
    expect(status().textContent).toMatch(/cannot be changed/);
    await use();
    expect(onUse).not.toHaveBeenCalled();
  });

  it("says why when the script locks while the color is being applied", async () => {
    await mount("#ff8800", [], vi.fn(async () => "locked" as const));
    await use();
    expect(status().textContent).toMatch(/cannot be changed/);
  });

  it("says so when the value has moved in the script", async () => {
    await mount("#ff8800", [], vi.fn(async () => "moved" as const));
    await use();
    expect(status().textContent).not.toBe("");
  });

  it("fades the current color in along the opacity track", async () => {
    await mount("#ff880080");
    expect(slider().className.split(/\s+/)).toContain("slider-opacity-track");
    expect(slider().style.getPropertyValue("--swatch")).toBe("#ff8800");
    await input(picker(), "#00aaff");
    expect(slider().style.getPropertyValue("--swatch")).toBe("#00aaff");
  });

  it("hides the story's colors when the story has none", async () => {
    await mount("#ff8800");
    expect(document.querySelector('[role="group"]')).toBeNull();
  });
});
