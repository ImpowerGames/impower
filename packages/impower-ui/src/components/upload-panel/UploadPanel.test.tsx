import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import UploadPanel, { type UploadPanelRow } from "./UploadPanel";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const ROWS: UploadPanelRow[] = [
  { key: "a", name: "forest.png", note: "Added to Backdrops", state: "added" },
  { key: "b", name: "rain.ogg", note: "Adding", state: "working" },
  { key: "c", name: "wind.ogg", note: "Waiting", state: "waiting" },
  { key: "d", name: "big.mp4", note: "Not added: no room", state: "failed" },
];

describe("UploadPanel", () => {
  it("announces its heading, lists a row per file with its bar and note, and closes", async () => {
    const onClose = vi.fn();
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<UploadPanel heading="Adding 3 of 4" rows={ROWS} onClose={onClose} />, host!));
    const panel = host.querySelector<HTMLElement>('section[aria-label="Added files"]')!;
    expect(panel.querySelector('[role="status"]')!.textContent).toBe("Adding 3 of 4");
    const rows = Array.from(panel.querySelectorAll("li"));
    expect(rows.map((row) => row.getAttribute("data-upload-row"))).toEqual(["added", "working", "waiting", "failed"]);
    expect(rows.map((row) => row.querySelector("small")!.textContent)).toEqual([
      "Added to Backdrops",
      "Adding",
      "Waiting",
      "Not added: no room",
    ]);
    const bars = rows.map((row) => row.querySelector('[role="progressbar"]')!);
    expect(bars.map((bar) => bar.getAttribute("aria-valuenow"))).toEqual(["100", null, "0", "0"]);
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual(["forest.png", "rain.ogg", "wind.ogg", "big.mp4"]);
    expect(rows[3]!.className).toContain("[&_small]:text-error");
    const close = panel.querySelector<HTMLButtonElement>('button[aria-label="Close added files"]')!;
    await act(async () => close.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("scrolls inside itself and keeps the wheel from chaining to the page once it ends", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<UploadPanel heading="1 file added" rows={ROWS.slice(0, 1)} onClose={() => {}} />, host!));
    const panel = host.querySelector<HTMLElement>("[data-upload-panel]")!;
    expect(panel.className).toContain("overflow-y-auto");
    expect(panel.className).toContain("overscroll-contain");
    expect(panel.className).toContain("max-h-[40vh]");
  });
});
