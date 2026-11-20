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
  onfinish: (() => void) | null;
  cancel: () => void;
};

let animations: FakeAnimation[] = [];
let reducedMotion = false;
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
  animations.filter((a) => a.target === target && !a.cancelled);

beforeEach(() => {
  vi.useFakeTimers();
  animations = [];
  reducedMotion = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("reduce") && reducedMotion,
    })),
  );
  Element.prototype.animate = function (
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const animation: FakeAnimation = {
      target: this,
      keyframes,
      options,
      currentTime: 0,
      cancelled: false,
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
    runOut!.onfinish!();
    const [fade] = live(bar);
    expect(fade?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    fade!.onfinish!();
    expect(bar.style.opacity).toBe("0");
  });

  it("restarts from the left edge when shown again", async () => {
    const { bar, segment } = await mount(false);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    live(segment)[0]!.currentTime = LOADING_BAR_CROSSING_MS / 2;
    await setActive(bar, false);
    live(segment)[0]!.onfinish!();
    live(bar)[0]!.onfinish!();
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    const [sweep] = live(segment);
    expect(sweep?.keyframes[0]?.transform).toBe("translateX(-50%) scaleX(0.5)");
    expect(sweep?.currentTime).toBe(0);
  });

  it("shows a static full-width bar with no sweep under reduced motion", async () => {
    reducedMotion = true;
    const { bar, segment } = await mount(false);
    await setActive(bar, true);
    vi.advanceTimersByTime(LOADING_BAR_SHOW_DELAY_MS);
    expect(bar.style.opacity).toBe("1");
    expect(segment.style.transform).toBe("none");
    expect(live(segment)).toHaveLength(0);
  });
});
