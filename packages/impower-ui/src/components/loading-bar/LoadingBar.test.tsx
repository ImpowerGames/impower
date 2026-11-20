import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOADING_BAR_CROSSING_MS,
  LOADING_BAR_SHOW_DELAY_MS,
  LoadingBar,
  setLoadingBarActive,
} from "./LoadingBar";

type FakeAnimation = {
  target: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  currentTime: number;
  cancelled: boolean;
  finished: boolean;
  onfinish: (() => void) | null;
  cancel: () => void;
};

let animations: FakeAnimation[] = [];
let reducedMotion = false;
let motionListeners: (() => void)[] = [];

const setReducedMotion = (value: boolean) => {
  reducedMotion = value;
  for (const listener of motionListeners) listener();
};
let host: HTMLDivElement;

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

const mount = async (active: boolean) => {
  let bar: HTMLDivElement | null = null;
  await act(async () =>
    render(
      <LoadingBar
        active={active}
        containerRef={(element: HTMLDivElement | null) => {
          bar = element;
        }}
      />,
      host,
    ),
  );
  const element = bar as unknown as HTMLDivElement;
  return { bar: element, segment: element.firstElementChild as HTMLElement };
};

const setActive = async (bar: HTMLElement, active: boolean) => {
  setLoadingBarActive(bar, active);
  await flush();
};

const live = (target: Element) =>
  animations.filter((a) => a.target === target && !a.cancelled && !a.finished);

const end = (animation: FakeAnimation | undefined) => {
  animation!.finished = true;
  animation!.onfinish!();
};

beforeEach(() => {
  vi.useFakeTimers();
  animations = [];
  reducedMotion = false;
  motionListeners = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return query.includes("reduce") && reducedMotion;
      },
      addEventListener: (_type: string, listener: () => void) => {
        motionListeners.push(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        motionListeners = motionListeners.filter((l) => l !== listener);
      },
    })),
  );
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const animation: FakeAnimation = {
      target: this,
      keyframes,
      options,
      currentTime: 0,
      cancelled: false,
      finished: false,
      onfinish: null,
      cancel() {
        animation.cancelled = true;
      },
    };
    animations.push(animation);
    return animation as unknown as Animation;
  } as typeof Element.prototype.animate;
  host = document.body.appendChild(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => render(null, host));
  host.remove();
  delete (Element.prototype as { animate?: unknown }).animate;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LoadingBar", () => {
  it("shows nothing for a load shorter than the show delay", async () => {
    const { bar } = await mount(false);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS - 50);
    await setActive(bar, false);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    expect(bar.style.opacity).toBe("0");
    expect(animations).toHaveLength(0);
  });

  it("starts the sweep from the left edge after the show delay", async () => {
    const { bar, segment } = await mount(false);
    await setActive(bar, true);
    expect(bar.style.opacity).toBe("0");
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    expect(bar.style.opacity).toBe("1");
    const [sweep] = live(segment);
    expect(sweep?.keyframes[0]?.transform).toBe("translateX(-50%) scaleX(0.5)");
    expect(sweep?.keyframes[1]?.transform).toBe("translateX(100%) scaleX(0.5)");
    expect(sweep?.options.duration).toBe(LOADING_BAR_CROSSING_MS);
  });

  it("runs the segment out to the right edge before fading when loading ends mid-track", async () => {
    const { bar, segment } = await mount(false);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    const [sweep] = live(segment);
    sweep!.currentTime = LOADING_BAR_CROSSING_MS / 3;
    await setActive(bar, false);
    expect(sweep!.cancelled).toBe(true);
    const [runOut] = live(segment);
    expect(runOut?.keyframes[0]?.transform).toBe("translateX(0%) scaleX(0.5)");
    expect(runOut?.keyframes[1]?.transform).toBe("translateX(100%) scaleX(0.5)");
    expect(runOut?.options.duration).toBeCloseTo(
      (LOADING_BAR_CROSSING_MS * 2) / 3,
    );
    expect(bar.style.opacity).toBe("1");
    expect(live(bar)).toHaveLength(0);
    end(runOut);
    const [fade] = live(bar);
    expect(fade?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    end(fade);
    expect(bar.style.opacity).toBe("0");
  });

  it("restarts from the left edge when shown again", async () => {
    const { bar, segment } = await mount(false);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    live(segment)[0]!.currentTime = LOADING_BAR_CROSSING_MS / 2;
    await setActive(bar, false);
    end(live(segment)[0]);
    end(live(bar)[0]);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    const [sweep] = live(segment);
    expect(sweep?.keyframes[0]?.transform).toBe("translateX(-50%) scaleX(0.5)");
    expect(sweep?.currentTime).toBe(0);
  });

  it("lets a run-out reach the right edge when the next load starts before it finishes", async () => {
    const { bar, segment } = await mount(false);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    live(segment)[0]!.currentTime = LOADING_BAR_CROSSING_MS / 3;
    await setActive(bar, false);
    const [runOut] = live(segment);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    expect(runOut!.cancelled).toBe(false);
    expect(live(segment)).toEqual([runOut]);
    end(runOut);
    expect(live(bar)).toHaveLength(0);
    expect(bar.style.opacity).toBe("1");
    const [sweep] = live(segment);
    expect(sweep?.options.iterations).toBe(Infinity);
    expect(sweep?.keyframes[0]?.transform).toBe("translateX(-50%) scaleX(0.5)");
  });

  it("spans its container's full width", async () => {
    const { bar } = await mount(false);
    expect(bar.classList.contains("w-full")).toBe(true);
    expect(bar.className).not.toContain("--loading-indicator-width");
  });

  it("hides at once with no run-out when reduced motion turns on during a sweep", async () => {
    const { bar, segment } = await mount(false);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    const [sweep] = live(segment);
    reducedMotion = true;
    await setActive(bar, false);
    expect(sweep!.cancelled).toBe(true);
    expect(bar.style.opacity).toBe("0");
    expect(animations).toEqual([sweep]);
  });

  it("turns a running sweep into the static bar when reduced motion turns on while loading", async () => {
    const { bar, segment } = await mount(false);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    const [sweep] = live(segment);
    setReducedMotion(true);
    expect(sweep!.cancelled).toBe(true);
    expect(live(segment)).toHaveLength(0);
    expect(segment.style.transform).toBe("none");
    expect(bar.style.opacity).toBe("1");
    setReducedMotion(false);
    const [restarted] = live(segment);
    expect(restarted?.keyframes[0]?.transform).toBe("translateX(-50%) scaleX(0.5)");
  });

  it("shows a static full-width bar with no sweep under reduced motion", async () => {
    reducedMotion = true;
    const { bar, segment } = await mount(false);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    expect(bar.style.opacity).toBe("1");
    expect(segment.style.transform).toBe("none");
    expect(live(segment)).toHaveLength(0);
    await setActive(bar, false);
    expect(bar.style.opacity).toBe("0");
    expect(animations).toHaveLength(0);
  });
});
