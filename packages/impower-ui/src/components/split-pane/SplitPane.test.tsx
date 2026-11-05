import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import SplitPane, { type SplitPaneProps } from "./SplitPane";

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
});

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  vi.restoreAllMocks();
});

const TRACK = 1008;

const mount = async (props: Partial<SplitPaneProps>) => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: TRACK,
    bottom: 600,
    width: TRACK,
    height: 600,
    toJSON: () => ({}),
  } as DOMRect);
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(<SplitPane start={<div />} end={<div />} {...props} />, host!),
  );
  const separator = host.querySelector<HTMLElement>('[role="separator"]')!;
  return { separator };
};

const pointer = (type: string, clientX: number) =>
  new PointerEvent(type, { bubbles: true, button: 0, clientX, pointerId: 1 });

const dragTo = async (separator: HTMLElement, clientX: number) => {
  await act(async () => {
    separator.dispatchEvent(pointer("pointerdown", 500));
    separator.dispatchEvent(pointer("pointermove", clientX));
    separator.dispatchEvent(pointer("pointerup", clientX));
  });
};

const startPx = (separator: HTMLElement) => {
  const panel = separator.previousElementSibling as HTMLElement;
  return Math.round((Number(panel.style.flexGrow) / 100) * (TRACK - 8));
};

describe("SplitPane", () => {
  it("starts at the default sizes", async () => {
    const { separator } = await mount({ defaultSizes: [53, 47] });
    expect(separator.getAttribute("aria-valuenow")).toBe("53");
  });

  it("keeps a separate minimum for each pane while dragging", async () => {
    const { separator } = await mount({
      defaultSizes: [53, 47],
      minSize: ["280px", "336px"],
    });
    await dragTo(separator, 40);
    expect(startPx(separator)).toBe(280);
    await dragTo(separator, 990);
    expect(startPx(separator)).toBe(TRACK - 8 - 336);
  });

  it("applies one minimum to both panes when given a single size", async () => {
    const { separator } = await mount({ minSize: "320px" });
    await dragTo(separator, 40);
    expect(startPx(separator)).toBe(320);
    await dragTo(separator, 990);
    expect(startPx(separator)).toBe(TRACK - 8 - 320);
  });
});
