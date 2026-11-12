import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import DropZone from "./DropZone";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("DropZone", () => {
  it("frames its pane with the landing note and an upload glyph, and never takes the pointer", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<DropZone title="Drop to add to Backdrops" />, host!));
    const zone = host.querySelector<HTMLElement>("[data-drop-zone]")!;
    expect(zone.getAttribute("data-drop-zone")).toBe("pane");
    expect(zone.getAttribute("aria-hidden")).toBe("true");
    expect(zone.className).toContain("pointer-events-none");
    expect(zone.className).toContain("absolute");
    expect(zone.textContent).toBe("Drop to add to Backdrops");
    expect(zone.querySelector("svg")).not.toBeNull();
  });

  it("covers the window with a title and its detail line", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(<DropZone scope="window" title="Drop to add to Assets" detail="Each file goes to the folder of its type." />, host!),
    );
    const zone = host.querySelector<HTMLElement>("[data-drop-zone]")!;
    expect(zone.getAttribute("data-drop-zone")).toBe("window");
    expect(zone.className).toContain("fixed");
    expect(zone.querySelector("strong")!.textContent).toBe("Drop to add to Assets");
    expect(zone.querySelector("strong + span")!.textContent).toBe("Each file goes to the folder of its type.");
    expect(zone.querySelector("svg")).toBeNull();
  });
});
