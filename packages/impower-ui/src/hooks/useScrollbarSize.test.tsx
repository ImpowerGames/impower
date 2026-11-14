import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCROLLBAR_SIZE_VARIABLE } from "../layout/scrollbar";
import { useScrollbarSize } from "./useScrollbarSize";

function Scroller() {
  useScrollbarSize();
  return <div class="overflow-y-auto pr-gutter-4" />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useScrollbarSize", () => {
  it("publishes the measured gutter on the root when a scroller that uses it mounts", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(90);
    expect(document.documentElement.style.getPropertyValue(SCROLLBAR_SIZE_VARIABLE)).toBe("");
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<Scroller />, host));
    expect(document.documentElement.style.getPropertyValue(SCROLLBAR_SIZE_VARIABLE)).toBe("10px");
    await act(async () => render(null, host));
    host.remove();
  });
});
