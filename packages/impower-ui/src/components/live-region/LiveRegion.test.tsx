import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { announce, announcement } from "../../hooks/useAnnouncer";
import LiveRegion from "./LiveRegion";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  announcement.value = "";
});

describe("LiveRegion", () => {
  it("is a polite, atomic status region hidden from sight", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<LiveRegion />, host!));
    const region = host.querySelector('[role="status"]')!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.className).toContain("sr-only");
  });

  it("speaks each announcement, and changes its text when the same words repeat", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<LiveRegion />, host!));
    const region = host.querySelector('[role="status"]')!;
    await act(async () => announce("Line numbers on."));
    expect(region.textContent).toBe("Line numbers on.");
    await act(async () => announce("Line numbers on."));
    expect(region.textContent).not.toBe("Line numbers on.");
    expect(region.textContent!.trim()).toBe("Line numbers on.");
    await act(async () => announce("   "));
    expect(region.textContent!.trim()).toBe("Line numbers on.");
  });
});
