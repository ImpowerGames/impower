import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { hitArea } from "../../../test/hitArea";
import CaretColorChip, { caretColorChipVariants } from "./CaretColorChip";

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

describe("CaretColorChip", () => {
  it("shows the colour under the caret as a swatch and its value as written", async () => {
    await mount(<CaretColorChip color="rgb(255 136 0 / 0.5)" value="#ff880080" />);
    const button = host!.querySelector("button")!;
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Change color #ff880080");
    expect(button.title).toBe("Change color #ff880080");
    expect(button.textContent).toBe("#ff880080");
    const swatch = button.querySelector<HTMLElement>("[data-caret-color-swatch]")!;
    expect(swatch.style.getPropertyValue("--swatch")).toBe("rgb(255 136 0 / 0.5)");
  });

  it("hands a press to its owner and forwards its ref", async () => {
    let presses = 0;
    let ref: HTMLButtonElement | null = null;
    await mount(
      <CaretColorChip
        ref={(element: HTMLButtonElement | null) => {
          ref = element;
        }}
        color="#ff8800"
        value="#ff8800"
        onClick={() => presses++}
      />,
    );
    const button = host!.querySelector("button")!;
    expect(ref).toBe(button);
    await act(async () => button.click());
    expect(presses).toBe(1);
  });

  it("draws an edged pill through its variant and keeps a 44px target", async () => {
    expect(caretColorChipVariants({ size: "default" })).toContain("border-edge");
    expect(caretColorChipVariants({ size: "default" })).toContain("rounded-full");
    await mount(<CaretColorChip color="#ff8800" value="#ff8800" />);
    const area = await hitArea(host!.querySelector("button")!);
    expect(area.height).toBeGreaterThanOrEqual(44);
  });
});
