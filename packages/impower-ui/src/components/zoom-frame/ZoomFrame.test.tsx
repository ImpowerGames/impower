import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ZoomFrame, {
  clampZoom,
  ZOOM_FIT,
  ZOOM_HELP,
  zoomAbout,
  zoomLabel,
  zoomPan,
  zoomPercent,
  zoomStep,
  type Zoom,
} from "./ZoomFrame";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLElement>("[data-zoom-frame]")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const readout = () => host!.querySelector<HTMLButtonElement>("[data-zoom-level]")!;
const button = (label: string) =>
  host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const view = (frame: HTMLElement) => frame.firstElementChild as HTMLElement;

const press = async (frame: HTMLElement, key: string) => {
  let event!: KeyboardEvent;
  await act(async () => {
    event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    frame.dispatchEvent(event);
  });
  return event;
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
  });
};

describe("zoom steps", () => {
  it.each<[string, Zoom, 1 | -1, number]>([
    ["fit steps in to 150%", ZOOM_FIT, 1, 1.5],
    ["150% steps in to 200%", { scale: 1.5, x: -0.25, y: -0.25 }, 1, 2],
    ["200% steps out to 150%", { scale: 2, x: -0.5, y: -0.5 }, -1, 1.5],
    ["150% steps out to fit", { scale: 1.5, x: -0.25, y: -0.25 }, -1, 1],
    ["fit does not step out", ZOOM_FIT, -1, 1],
    ["the largest level does not step in", { scale: 10, x: -4.5, y: -4.5 }, 1, 10],
    ["a level between steps reaches the next one", { scale: 2.5, x: -0.75, y: -0.75 }, 1, 3],
  ])("%s", (_name, from, direction, scale) => {
    expect(zoomStep(from, direction).scale).toBe(scale);
  });

  it("keeps the point it zooms about still and the picture inside the frame", () => {
    const zoomed = zoomAbout(ZOOM_FIT, 0.5, 0.5, 2);
    expect(zoomed).toEqual({ scale: 2, x: -0.5, y: -0.5 });
    expect(zoomAbout(ZOOM_FIT, 0, 0, 2)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(zoomPan(zoomed, 5, -5)).toEqual({ scale: 2, x: 0, y: -1 });
    expect(clampZoom({ scale: 0.5, x: 3, y: 3 })).toBe(ZOOM_FIT);
    expect(zoomPan(ZOOM_FIT, 0.3, 0.3)).toBe(ZOOM_FIT);
  });

  it("reads the level as a percentage and names the fit it returns to", () => {
    expect(zoomPercent(ZOOM_FIT)).toBe("100%");
    expect(zoomLabel(ZOOM_FIT)).toBe("Zoom 100%");
    expect(zoomLabel({ scale: 2, x: -0.5, y: -0.5 })).toBe("Zoom 200%, fit to frame");
  });
});

describe("ZoomFrame", () => {
  it("frames any child at its ratio without zoom controls unless asked", async () => {
    const frame = await mount(
      <ZoomFrame label="intro.webm" ratio={2} surface="sheet">
        <p>specimen</p>
      </ZoomFrame>,
    );
    expect(frame.getAttribute("aria-label")).toBe("intro.webm");
    expect(frame.style.getPropertyValue("--frame-ratio")).toBe("2");
    expect(frame.className).toContain("border-edge");
    expect(frame.textContent).toBe("specimen");
    expect(frame.hasAttribute("tabindex")).toBe(false);
    expect(host!.querySelector("[data-zoom-controls]")).toBeNull();
    expect(frame.querySelector(".checkerboard")).toBeNull();
  });

  it("zooms by the buttons, a double click and the plus key to the same 200% readout, and fits again", async () => {
    const frame = await mount(
      <ZoomFrame label="harbor" zoomable backdrop="checker">
        <img alt="" />
      </ZoomFrame>,
    );
    expect(frame.getAttribute("tabindex")).toBe("0");
    expect(frame.getAttribute("aria-roledescription")).toBe("zoomable picture");
    expect(frame.getAttribute("aria-description")).toBe(ZOOM_HELP);
    expect(frame.querySelector(".checkerboard")).not.toBeNull();
    expect(readout().textContent).toBe("100%");
    expect(button("Zoom out").disabled).toBe(true);

    await click(button("Zoom in"));
    await click(button("Zoom in"));
    expect(readout().textContent).toBe("200%");
    expect(readout().getAttribute("aria-label")).toBe("Zoom 200%, fit to frame");
    expect(frame.hasAttribute("data-zoomed")).toBe(true);
    expect(view(frame).style.transform).toContain("scale(2.0000)");

    await click(readout());
    expect(readout().textContent).toBe("100%");

    await act(async () => {
      frame.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 0, clientY: 0 }));
    });
    expect(readout().textContent).toBe("200%");
    await act(async () => {
      frame.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(readout().textContent).toBe("100%");

    expect((await press(frame, "+")).defaultPrevented).toBe(true);
    await press(frame, "=");
    expect(readout().textContent).toBe("200%");
    await press(frame, "-");
    expect(readout().textContent).toBe("150%");
    await press(frame, "0");
    expect(readout().textContent).toBe("100%");
  });

  it("moves a zoomed picture with the arrow keys and leaves the arrows to its page at fit", async () => {
    const frame = await mount(<ZoomFrame label="harbor" zoomable />);
    const atFit = await press(frame, "ArrowRight");
    expect(atFit.defaultPrevented).toBe(false);
    await press(frame, "+");
    await press(frame, "+");
    const before = view(frame).style.transform;
    const moved = await press(frame, "ArrowRight");
    expect(moved.defaultPrevented).toBe(true);
    expect(view(frame).style.transform).not.toBe(before);
    expect(view(frame).style.transform).toContain("translate(-55.000%");
  });

  it("zooms with a pinch on a trackpad, as a control wheel, and lets a plain wheel scroll", async () => {
    const frame = await mount(<ZoomFrame label="harbor" zoomable />);
    const plain = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    await act(async () => {
      frame.dispatchEvent(plain);
    });
    expect(plain.defaultPrevented).toBe(false);
    expect(readout().textContent).toBe("100%");
    const pinch = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => {
      frame.dispatchEvent(pinch);
    });
    expect(pinch.defaultPrevented).toBe(true);
    expect(readout().textContent).toBe("272%");
  });

  it("offers View full size only when asked, and its button neither zooms nor drags the picture", async () => {
    expect((await mount(<ZoomFrame label="harbor" zoomable />)).querySelector("[data-zoom-expand]")).toBeNull();
    let expanded = 0;
    const frame = await mount(<ZoomFrame label="harbor" zoomable onExpand={() => (expanded += 1)} />);
    const expand = frame.querySelector<HTMLButtonElement>("[data-zoom-expand]")!;
    expect(expand.getAttribute("aria-label")).toBe("View full size");
    expect(expand.hasAttribute("data-zoom-controls")).toBe(true);
    const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerType: "mouse" });
    await act(async () => {
      expand.dispatchEvent(down);
      expand.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(down.defaultPrevented).toBe(false);
    expect(frame.hasAttribute("data-zoomed")).toBe(false);
    await click(expand);
    expect(expanded).toBe(1);
  });

  it("fits a pane by width and the screen by both edges, square edged", async () => {
    const pane = await mount(<ZoomFrame label="harbor" ratio={2} />);
    expect(pane.className).toContain("w-full");
    expect(pane.className).toContain("rounded-[10px]");
    const screen = await mount(<ZoomFrame label="harbor" ratio={2} fit="screen" />);
    expect(screen.className).toContain("w-[min(100vw,calc(100dvh*var(--frame-ratio)))]");
    expect(screen.className).toContain("max-h-dvh");
    expect(screen.className).toContain("rounded-none");
    expect(screen.className).not.toContain("max-h-[40vh]");
  });

  it("does not zoom on a double click on its own controls", async () => {
    const frame = await mount(<ZoomFrame label="harbor" zoomable />);
    await act(async () => {
      button("Zoom in").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(readout().textContent).toBe("100%");
    expect(frame.hasAttribute("data-zoomed")).toBe(false);
  });
});
