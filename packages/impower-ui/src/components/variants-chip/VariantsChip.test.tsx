import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import VariantsChip, { variantsLabel } from "./VariantsChip";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("VariantsChip", () => {
  it("names the count of variants, shortened past a thousand", () => {
    expect([variantsLabel(1), variantsLabel(3), variantsLabel(1200)]).toEqual(["1 variant", "3 variants", "1.2K variants"]);
  });

  it("draws the count as a chip at each size", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<VariantsChip count={3} size="compact" />, host!));
    const chip = host.querySelector<HTMLElement>("[data-variants-chip]")!;
    expect(chip.textContent).toBe("3 variants");
    expect(chip.title).toBe("3 variants");
    expect(chip.className).toContain("text-[9px]");
  });
});
