import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import SplitPane, {
  type SplitPanePinned,
  type SplitPaneProps,
} from "./SplitPane";

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
  it("clips both panels unless one is named to overflow", async () => {
    await mount({});
    const panels = host!.querySelectorAll<HTMLElement>("[data-panel]");
    expect(Array.from(panels).map((p) => p.classList.contains("overflow-hidden"))).toEqual([true, true]);
  });

  it("lets the named panel paint past its edge and keeps the other clipped", async () => {
    await mount({ overflowPanel: "start" });
    const start = host!.querySelector<HTMLElement>('[data-panel="start"]')!;
    const end = host!.querySelector<HTMLElement>('[data-panel="end"]')!;
    expect(start.classList.contains("overflow-visible")).toBe(true);
    expect(start.classList.contains("overflow-hidden")).toBe(false);
    expect(end.classList.contains("overflow-hidden")).toBe(true);
  });

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

const HEIGHT = 608;

const mountPinned = async (
  pinned: Partial<SplitPanePinned>,
  props: Partial<SplitPaneProps> = {},
) => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(HEIGHT);
  const onSizeChange = vi.fn();
  host = document.body.appendChild(document.createElement("div"));
  const view = (size?: number) => (
    <SplitPane
      orientation="vertical"
      start={<div />}
      end={<div />}
      label="Resize game and panel"
      pinned={{
        panel: "end",
        defaultSize: 44,
        minSize: 144,
        collapsedSize: 44,
        reserve: 160,
        onSizeChange,
        ...pinned,
        size,
      }}
      {...props}
    />
  );
  await act(async () => render(view(pinned.size), host!));
  const separator = host.querySelector<HTMLElement>('[role="separator"]')!;
  const root = host.firstElementChild as HTMLElement;
  const rerender = (size?: number) => act(async () => render(view(size), host!));
  return { separator, root, onSizeChange, rerender };
};

const pointerY = (type: string, clientY: number) =>
  new PointerEvent(type, { bubbles: true, button: 0, clientY, pointerId: 1 });

const key = (separator: HTMLElement, name: string, shiftKey = false) =>
  act(async () => {
    separator.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true }),
    );
  });

const pinnedPx = (separator: HTMLElement) =>
  Number(separator.getAttribute("aria-valuenow"));

describe("SplitPane with a pinned panel", () => {
  it("names the separator and starts collapsed at the default size", async () => {
    const { separator, root } = await mountPinned({});
    expect(separator.getAttribute("aria-label")).toBe("Resize game and panel");
    expect(pinnedPx(separator)).toBe(44);
    expect(root.dataset["split"]).toBe("collapsed");
  });

  it("lets the named panel paint past its edge while pinned", async () => {
    const { root } = await mountPinned({}, { overflowPanel: "start" });
    const start = root.querySelector<HTMLElement>('[data-panel="start"]')!;
    const end = root.querySelector<HTMLElement>('[data-panel="end"]')!;
    expect(start.classList.contains("overflow-visible")).toBe(true);
    expect(end.classList.contains("overflow-hidden")).toBe(true);
  });

  it("grows the end panel when dragged up and commits once on release", async () => {
    const { separator, root, onSizeChange } = await mountPinned({});
    await act(async () => {
      separator.dispatchEvent(pointerY("pointerdown", 500));
      separator.dispatchEvent(pointerY("pointermove", 400));
      separator.dispatchEvent(pointerY("pointermove", 300));
    });
    expect(pinnedPx(separator)).toBe(244);
    expect(onSizeChange).not.toHaveBeenCalled();
    await act(async () => {
      separator.dispatchEvent(pointerY("pointerup", 300));
    });
    expect(onSizeChange.mock.calls).toEqual([[244]]);
    expect(root.dataset["split"]).toBe("expanded");
  });

  it("snaps a size dragged below the minimum to the collapsed size", async () => {
    const { separator, onSizeChange } = await mountPinned({ size: 260 });
    await act(async () => {
      separator.dispatchEvent(pointerY("pointerdown", 300));
      separator.dispatchEvent(pointerY("pointermove", 430));
      separator.dispatchEvent(pointerY("pointerup", 430));
    });
    expect(onSizeChange.mock.calls).toEqual([[44]]);
  });

  it("commits the last position when the pointer is cancelled", async () => {
    const { separator, onSizeChange } = await mountPinned({ size: 200 });
    await act(async () => {
      separator.dispatchEvent(pointerY("pointerdown", 300));
      separator.dispatchEvent(pointerY("pointermove", 240));
      separator.dispatchEvent(pointerY("pointercancel", 0));
    });
    expect(onSizeChange.mock.calls).toEqual([[260]]);
  });

  it("keeps the reserve for the other panel", async () => {
    const { separator } = await mountPinned({ size: 2000 });
    expect(pinnedPx(separator)).toBe(HEIGHT - 8 - 160);
  });

  it("grows with Up and shrinks with Down, by 16px or 64px with Shift", async () => {
    const { separator, onSizeChange, rerender } = await mountPinned({
      size: 200,
    });
    await key(separator, "ArrowUp");
    expect(onSizeChange).toHaveBeenLastCalledWith(216);
    await rerender(216);
    await key(separator, "ArrowDown", true);
    expect(onSizeChange).toHaveBeenLastCalledWith(152);
    await rerender(152);
    await key(separator, "ArrowDown");
    expect(onSizeChange).toHaveBeenLastCalledWith(44);
    await rerender(44);
    await key(separator, "ArrowUp");
    expect(onSizeChange).toHaveBeenLastCalledWith(144);
  });

  it("collapses on Home and grows fully on End", async () => {
    const { separator, onSizeChange } = await mountPinned({ size: 200 });
    await key(separator, "Home");
    expect(onSizeChange).toHaveBeenLastCalledWith(44);
    await key(separator, "End");
    expect(onSizeChange).toHaveBeenLastCalledWith(HEIGHT - 8 - 160);
  });

  it("resets to the default on Enter and on double-click, clearing the saved size", async () => {
    const { separator, onSizeChange, rerender } = await mountPinned({
      size: 300,
    });
    await key(separator, "Enter");
    expect(onSizeChange).toHaveBeenLastCalledWith(undefined);
    await rerender(undefined);
    expect(pinnedPx(separator)).toBe(44);
    await rerender(300);
    expect(pinnedPx(separator)).toBe(300);
    await act(async () => {
      separator.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(onSizeChange).toHaveBeenCalledTimes(2);
    expect(onSizeChange).toHaveBeenLastCalledWith(undefined);
    await rerender(undefined);
    expect(pinnedPx(separator)).toBe(44);
  });

  it("follows a new default after a reset with nothing saved", async () => {
    const { separator, onSizeChange } = await mountPinned({});
    await key(separator, "Enter");
    expect(onSizeChange).toHaveBeenLastCalledWith(undefined);
    expect(pinnedPx(separator)).toBe(44);
    await act(async () =>
      render(
        <SplitPane
          orientation="vertical"
          start={<div />}
          end={<div />}
          pinned={{
            panel: "end",
            defaultSize: 200,
            minSize: 144,
            collapsedSize: 44,
            reserve: 160,
            onSizeChange,
          }}
        />,
        host!,
      ),
    );
    expect(pinnedPx(separator)).toBe(200);
  });

  it("follows the visual order when reversed", async () => {
    const { separator, root, onSizeChange } = await mountPinned(
      { size: 200 },
      { reverse: true },
    );
    expect(
      root.firstElementChild!.className.includes("flex-col-reverse"),
    ).toBe(true);
    await key(separator, "ArrowDown");
    expect(onSizeChange).toHaveBeenLastCalledWith(216);
    await act(async () => {
      separator.dispatchEvent(pointerY("pointerdown", 200));
      separator.dispatchEvent(pointerY("pointermove", 250));
      separator.dispatchEvent(pointerY("pointerup", 250));
    });
    expect(onSizeChange).toHaveBeenLastCalledWith(266);
  });
});
