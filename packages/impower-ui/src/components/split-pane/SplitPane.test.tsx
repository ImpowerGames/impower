import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import SplitPane, {
  type SplitPanePinned,
  type SplitPaneProps,
} from "./SplitPane";

const packageCss = async (classes: string[]): Promise<string> => {
  const source = readFileSync(resolve("src/style.css"), "utf8");
  const compiler = await compile(source, { base: resolve("src"), onDependency: () => {} });
  return optimize(compiler.build(classes), { minify: false }).code;
};

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
  it("draws the edge line at rest unless asked for none, and keeps the accent bar and target either way", async () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      const edge = (await mount({ orientation })).separator.classList;
      expect(edge.contains("before:bg-edge")).toBe(true);
      expect(edge.contains("before:bg-transparent")).toBe(false);
      const none = (await mount({ orientation, line: "none" })).separator
        .classList;
      expect(none.contains("before:bg-edge")).toBe(false);
      expect(none.contains("before:bg-transparent")).toBe(true);
      for (const kept of [
        "hover:after:opacity-100",
        "focus-visible:after:opacity-100",
        "data-[separator=active]:after:opacity-100",
        orientation === "horizontal" ? "w-2" : "h-2",
      ]) {
        expect(none.contains(kept)).toBe(true);
      }
    }
  });

  it("fills a between-surfaces strip with each neighbour's surface on its own side of the line, and a line-none strip with neither", async () => {
    const strip = (classes: DOMTokenList) =>
      Array.from(classes).filter((c) => c.startsWith("bg-["));
    for (const orientation of ["horizontal", "vertical"] as const) {
      const axis = orientation === "horizontal" ? "to_right" : "to_bottom";
      const forward = strip((await mount({ orientation })).separator.classList);
      expect(forward).toEqual([
        `bg-[linear-gradient(${axis},var(--split-start-surface,transparent)_3px,transparent_3px_4px,var(--split-end-surface,transparent)_4px)]`,
      ]);
      const reversed = strip(
        (await mount({ orientation, reverse: true })).separator.classList,
      );
      expect(reversed).toEqual([
        `bg-[linear-gradient(${axis},var(--split-end-surface,transparent)_3px,transparent_3px_4px,var(--split-start-surface,transparent)_4px)]`,
      ]);
      const none = (await mount({ orientation, line: "none" })).separator
        .classList;
      expect(strip(none)).toEqual([]);
      expect(none.contains(orientation === "horizontal" ? "before:left-[3px]" : "before:top-[3px]")).toBe(true);
    }
  });

  it("compiles each between-surfaces strip to the neighbours' surfaces around a clear 1px gap at 3px, and the line to 1px at 3px", async () => {
    const cases = [
      { orientation: "horizontal", reverse: false, axis: "to right", first: "start", second: "end", line: "left: 3px" },
      { orientation: "horizontal", reverse: true, axis: "to right", first: "end", second: "start", line: "left: 3px" },
      { orientation: "vertical", reverse: false, axis: "to bottom", first: "start", second: "end", line: "top: 3px" },
      { orientation: "vertical", reverse: true, axis: "to bottom", first: "end", second: "start", line: "top: 3px" },
    ] as const;
    for (const c of cases) {
      const { separator } = await mount({ orientation: c.orientation, reverse: c.reverse });
      const css = await packageCss(Array.from(separator.classList));
      expect(css).toContain(
        `background-image: linear-gradient(${c.axis},var(--split-${c.first}-surface, transparent) 3px,transparent 3px 4px,var(--split-${c.second}-surface, transparent) 4px);`,
      );
      expect(css).toMatch(new RegExp(`:?:before[^{]*\\{[^}]*${c.line};`));
    }
    const none = (await mount({ line: "none" })).separator;
    expect(await packageCss(Array.from(none.classList))).not.toContain("background-image");
  });

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

  it("holds a fixed panel at its size with no handle, and keeps both panels when the handle returns", async () => {
    host = document.body.appendChild(document.createElement("div"));
    const draw = (fixed: SplitPaneProps["fixed"]) =>
      act(async () =>
        render(
          <SplitPane
            orientation="vertical"
            reverse
            fixed={fixed}
            start={<div data-start />}
            end={<div data-end />}
          />,
          host!,
        ),
      );
    await draw({ panel: "end", size: "104px" });
    const end = host.querySelector<HTMLElement>('[data-panel="end"]')!;
    const start = host.querySelector<HTMLElement>('[data-panel="start"]')!;
    const separator = host.querySelector<HTMLElement>('[role="separator"]')!;
    expect(end.style.flexBasis).toBe("104px");
    expect(end.className).toContain("flex-none");
    expect(start.className).toContain("flex-1");
    expect(separator.className).toContain("hidden");
    expect(separator.tabIndex).toBe(-1);
    const inner = host.querySelector("[data-end]");
    await draw(undefined);
    expect(host.querySelector('[data-panel="end"]')).toBe(end);
    expect(host.querySelector("[data-end]")).toBe(inner);
    expect(separator.className).not.toContain("hidden");
    expect(separator.tabIndex).toBe(0);
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

const declaration = async (
  classes: string[],
  className: string,
  expected: string,
) => {
  expect(classes).toContain(className);
  expect(await packageCss([className])).toContain(expected);
};

describe("SplitPane highlights", () => {
  it("lights the 1px line itself in the accent colour, at the rest line's place", async () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      for (const line of ["edge", "none"] as const) {
        const classes = Array.from(
          (await mount({ orientation, line })).separator.classList,
        );
        const horizontal = orientation === "horizontal";
        await declaration(classes, horizontal ? "after:left-[3px]" : "after:top-[3px]", horizontal ? "left: 3px;" : "top: 3px;");
        await declaration(classes, horizontal ? "after:w-px" : "after:h-px", horizontal ? "width: 1px;" : "height: 1px;");
        await declaration(classes, "after:bg-accent", "background-color: var(--accent);");
        expect(classes).toContain(horizontal ? "w-2" : "h-2");
        for (const thick of ["after:w-1", "after:h-1", "after:bg-primary"]) {
          expect(classes).not.toContain(thick);
        }
      }
    }
  });

  it("draws the grip as a zero-height overlay with a 32 by 3 pill, muted at rest and accent when hovered, focused or dragged", async () => {
    const classes = Array.from(
      (await mount({ orientation: "vertical", line: "grip" })).separator.classList,
    );
    await declaration(classes, "h-3", "height: calc(var(--spacing) * 3);");
    await declaration(classes, "-my-1.5", "margin-block: calc(var(--spacing) * -1.5);");
    await declaration(classes, "after:w-8", "width: calc(var(--spacing) * 8);");
    await declaration(classes, "after:h-[3px]", "height: 3px;");
    await declaration(classes, "after:left-[calc(50%-16px)]", "left: calc(50% - 16px);");
    await declaration(classes, "after:top-[calc(50%+4px)]", "top: calc(50% + 4px);");
    await declaration(classes, "after:rounded-[2px]", "border-radius: 2px;");
    await declaration(classes, "after:bg-muted", "background-color: var(--muted);");
    await declaration(classes, "before:w-12", "width: calc(var(--spacing) * 12);");
    await declaration(classes, "before:h-11", "height: calc(var(--spacing) * 11);");
    for (const kept of [
      "after:opacity-0",
      "hover:after:bg-accent",
      "focus-visible:after:bg-accent",
      "data-[separator=active]:after:bg-accent",
      "hover:after:opacity-100",
      "focus-visible:after:opacity-100",
      "data-[separator=active]:after:opacity-100",
    ]) {
      expect(classes).toContain(kept);
    }
    for (const absent of ["h-2", "after:h-px", "before:pointer-events-none"]) {
      expect(classes).not.toContain(absent);
    }
    expect(classes.some((c) => c.startsWith("bg-["))).toBe(false);
  });

  it("gives a pinned grip pane the whole height, with no divider row taken out", async () => {
    const { separator, onSizeChange } = await mountPinned(
      { size: 2000 },
      { line: "grip" },
    );
    expect(pinnedPx(separator)).toBe(HEIGHT - 160);
    await key(separator, "End");
    expect(onSizeChange).toHaveBeenLastCalledWith(HEIGHT - 160);
  });
});
