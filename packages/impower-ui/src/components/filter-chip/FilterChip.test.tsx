import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WarningIcon } from "../icon/icons.generated";
import FilterChip from "./FilterChip";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector("button")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("FilterChip", () => {
  it("is a toggle button that reports the opposite of its pressed state", async () => {
    const onPressedChange = vi.fn();
    const chip = await mount(
      <FilterChip
        tone="warning"
        icon={<WarningIcon />}
        pressed
        onPressedChange={onPressedChange}
        aria-label="2 warnings. Hide warnings"
      >
        2 warnings
      </FilterChip>,
    );
    expect(chip.getAttribute("type")).toBe("button");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.getAttribute("aria-label")).toBe("2 warnings. Hide warnings");
    expect(chip.textContent).toBe("2 warnings");
    expect(chip.className).toContain("text-warning");
    await act(async () => chip.click());
    expect(onPressedChange).toHaveBeenCalledWith(false);
  });

  it("mutes an unpressed chip through its aria-pressed state", async () => {
    const chip = await mount(
      <FilterChip tone="error" pressed={false} onPressedChange={() => {}}>
        1 error
      </FilterChip>,
    );
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(chip.className).toContain("aria-[pressed=false]:text-muted");
  });
});
