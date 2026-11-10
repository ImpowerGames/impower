import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import TreeToggle from "./TreeToggle";

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

describe("TreeToggle", () => {
  it("is a labelled button that reports whether its branch is open and asks to toggle it", async () => {
    const onToggle = vi.fn();
    await mount(<TreeToggle expanded label="Collapse Vars" onToggle={onToggle} />);
    const button = host!.querySelector("button")!;
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Collapse Vars");
    expect(button.getAttribute("title")).toBe("Collapse Vars");
    await act(async () => button.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("turns its chevron to point at a closed branch, with the turn kept for motion-safe", async () => {
    await mount(<TreeToggle expanded={false} label="Expand Vars" onToggle={() => {}} />);
    const button = host!.querySelector("button")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.className).toContain("[&_svg]:-rotate-90");
    expect(button.className).toContain("[&_svg]:motion-safe:transition-transform");
    expect(button.querySelector("svg")).not.toBeNull();
  });
});
