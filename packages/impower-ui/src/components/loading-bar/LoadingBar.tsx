import { cva } from "class-variance-authority";
import type { JSX, Ref } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { cn } from "../../utils/cn";
import { useForwardedRef } from "../../hooks/useForwardedRef";

export type LoadingBarProps = {
  containerRef?: Ref<HTMLDivElement>;
  label: string;
  active?: boolean;
  showDelayMs?: number;
  exit?: LoadingBarExit;
  class?: string;
  style?: JSX.CSSProperties;
};

export type LoadingBarExit = "run-out" | "instant";

export type LoadingBarTiming = {
  showDelayMs: number;
  exit: LoadingBarExit;
};

export const LOADING_BAR_SHOW_DELAY_MS = 300;
export const LOADING_BAR_CROSSING_MS = 1200;
export const LOADING_BAR_FADE_MS = 150;

const SEGMENT_START = -0.5;
const SEGMENT_END = 1;
const SEGMENT_ON_SCREEN = -SEGMENT_START / (SEGMENT_END - SEGMENT_START);

const segmentTransform = (position: number) =>
  `translateX(${position * 100}%) scaleX(0.5)`;

const loadingBar = cva([
  "relative h-0.5 min-w-20 overflow-hidden text-primary pointer-events-none w-full",
]);

export function setLoadingBarActive(
  bar: HTMLElement | null | undefined,
  active: boolean,
) {
  bar?.setAttribute("data-active", String(active));
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia(REDUCED_MOTION_QUERY).matches;

function driveLoadingBar(
  bar: HTMLElement,
  segment: HTMLElement,
  timing: () => LoadingBarTiming,
) {
  let showTimer = 0;
  let shown = false;
  let sweep: Animation | undefined;
  let finish: Animation | undefined;
  let fade: Animation | undefined;
  let sweepEntry = 0;
  const canAnimate = typeof segment.animate === "function";

  const cancelMotion = () => {
    sweep?.cancel();
    finish?.cancel();
    fade?.cancel();
    sweep = finish = fade = undefined;
  };

  const show = (entry = 0) => {
    showTimer = 0;
    cancelMotion();
    shown = true;
    bar.style.opacity = "1";
    bar.removeAttribute("aria-hidden");
    if (prefersReducedMotion() || !canAnimate) {
      segment.style.transform = "none";
      return;
    }
    sweepEntry = entry;
    segment.style.transform = segmentTransform(
      SEGMENT_START + (SEGMENT_END - SEGMENT_START) * entry,
    );
    sweep = segment.animate(
      [
        { transform: segmentTransform(SEGMENT_START) },
        { transform: segmentTransform(SEGMENT_END) },
      ],
      {
        duration: LOADING_BAR_CROSSING_MS,
        iterations: Infinity,
        iterationStart: entry,
      },
    );
  };

  const hide = () => {
    shown = false;
    bar.setAttribute("aria-hidden", "true");
    bar.style.opacity = "0";
    cancelMotion();
  };

  const fadeOut = () => {
    if (!canAnimate || prefersReducedMotion()) {
      hide();
      return;
    }
    bar.style.opacity = "0";
    fade = bar.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: LOADING_BAR_FADE_MS,
    });
    fade.onfinish = hide;
  };

  const runOut = () => {
    const elapsed = Number(sweep?.currentTime ?? 0);
    const progress =
      ((elapsed + sweepEntry * LOADING_BAR_CROSSING_MS) %
        LOADING_BAR_CROSSING_MS) /
      LOADING_BAR_CROSSING_MS;
    const position = SEGMENT_START + (SEGMENT_END - SEGMENT_START) * progress;
    sweep?.cancel();
    sweep = undefined;
    segment.style.transform = segmentTransform(SEGMENT_END);
    finish = segment.animate(
      [
        { transform: segmentTransform(position) },
        { transform: segmentTransform(SEGMENT_END) },
      ],
      { duration: (1 - progress) * LOADING_BAR_CROSSING_MS },
    );
    finish.onfinish = () => {
      finish = undefined;
      if (bar.getAttribute("data-active") === "false") {
        fadeOut();
      } else {
        show();
      }
    };
  };

  const apply = (active: boolean) => {
    bar.setAttribute("aria-busy", String(active));
    if (active) {
      if (showTimer || sweep || finish || (shown && !fade)) {
        return;
      }
      if (fade) {
        show();
        return;
      }
      const { showDelayMs } = timing();
      if (showDelayMs <= 0) {
        show(SEGMENT_ON_SCREEN);
        return;
      }
      showTimer = window.setTimeout(() => show(), showDelayMs);
      return;
    }
    if (showTimer) {
      window.clearTimeout(showTimer);
      showTimer = 0;
    }
    if (!shown) {
      return;
    }
    if (timing().exit === "instant") {
      hide();
      return;
    }
    if (finish || fade) {
      return;
    }
    if (sweep && !prefersReducedMotion()) {
      runOut();
    } else {
      fadeOut();
    }
  };

  const onMotionChange = () => {
    if (!shown) {
      return;
    }
    const reduced = prefersReducedMotion();
    if (fade) {
      if (reduced) {
        hide();
      }
      return;
    }
    if (finish && !reduced) {
      return;
    }
    finish?.cancel();
    finish = undefined;
    if (bar.getAttribute("data-active") === "false") {
      fadeOut();
    } else {
      show();
    }
  };

  const motionQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia(REDUCED_MOTION_QUERY)
      : undefined;
  motionQuery?.addEventListener?.("change", onMotionChange);
  apply(bar.getAttribute("data-active") !== "false");
  const observer = new MutationObserver(() =>
    apply(bar.getAttribute("data-active") !== "false"),
  );
  observer.observe(bar, { attributes: true, attributeFilter: ["data-active"] });
  return () => {
    observer.disconnect();
    motionQuery?.removeEventListener?.("change", onMotionChange);
    window.clearTimeout(showTimer);
    cancelMotion();
  };
}

export function LoadingBar({
  containerRef,
  label,
  active = true,
  showDelayMs = LOADING_BAR_SHOW_DELAY_MS,
  exit = "run-out",
  class: className,
  style,
}: LoadingBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const attachBar = useForwardedRef(containerRef, (element) => {
    barRef.current = element;
  });
  const segmentRef = useRef<HTMLDivElement>(null);
  const timingRef = useRef<LoadingBarTiming>({ showDelayMs, exit });
  timingRef.current = { showDelayMs, exit };

  useLayoutEffect(() => {
    const bar = barRef.current;
    const segment = segmentRef.current;
    if (!bar || !segment) return;
    return driveLoadingBar(bar, segment, () => timingRef.current);
  }, []);

  return (
    <div
      ref={attachBar}
      role="progressbar"
      aria-label={label}
      aria-hidden="true"
      data-active={String(active)}
      class={cn(loadingBar(), className)}
      style={{ opacity: 0, ...style }}
    >
      <div
        ref={segmentRef}
        class="absolute inset-0 bg-current"
        style={{ transformOrigin: "left" }}
      />
    </div>
  );
}

export default LoadingBar;
