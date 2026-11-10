import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import VariantsBadge from "./VariantsBadge";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("VariantsBadge", () => {
  it("shows the layers glyph and the short count, and names the count in words", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<VariantsBadge count={1500} />, host!));
    const badge = host.querySelector<HTMLElement>("[data-variants-badge]")!;
    expect(badge.getAttribute("role")).toBe("img");
    expect(badge.getAttribute("aria-label")).toBe("1.5K variants");
    expect(badge.querySelector("svg")).not.toBeNull();
    expect(badge.textContent).toBe("1.5K");
    expect(badge.className).toContain("pointer-events-none");
  });
});
