import { cva } from "class-variance-authority";
import type { JSX, Ref } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { cn } from "../../utils/cn";
import { useForwardedRef } from "../../hooks/useForwardedRef";

export type LoadingBarProps = {
  containerRef?: Ref<HTMLDivElement>;
  active?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
};

export const LOADING_BAR_SHOW_DELAY_MS = 300;
export const LOADING_BAR_CROSSING_MS = 1200;
export const LOADING_BAR_FADE_MS = 150;

const SEGMENT_START = -0.5;
const SEGMENT_END = 1;

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

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function driveLoadingBar(bar: HTMLElement, segment: HTMLElement) {
  let showTimer = 0;
  let shown = false;
  let sweep: Animation | undefined;
  let finish: Animation | undefined;
  let fade: Animation | undefined;
  const canAnimate = typeof segment.animate === "function";

  const cancelMotion = () => {
    sweep?.cancel();
    finish?.cancel();
    fade?.cancel();
    sweep = finish = fade = undefined;
  };

  const show = () => {
    showTimer = 0;
    cancelMotion();
    shown = true;
    bar.style.opacity = "1";
    if (prefersReducedMotion() || !canAnimate) {
      segment.style.transform = "none";
      return;
    }
    segment.style.transform = segmentTransform(SEGMENT_START);
    sweep = segment.animate(
      [
        { transform: segmentTransform(SEGMENT_START) },
        { transform: segmentTransform(SEGMENT_END) },
      ],
      { duration: LOADING_BAR_CROSSING_MS, iterations: Infinity },
    );
  };

  const hide = () => {
    shown = false;
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
      (elapsed % LOADING_BAR_CROSSING_MS) / LOADING_BAR_CROSSING_MS;
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
      showTimer = window.setTimeout(show, LOADING_BAR_SHOW_DELAY_MS);
      return;
    }
    if (showTimer) {
      window.clearTimeout(showTimer);
      showTimer = 0;
    }
    if (!shown || finish || fade) {
      return;
    }
    if (sweep && !prefersReducedMotion()) {
      runOut();
    } else {
      fadeOut();
    }
  };

  apply(bar.getAttribute("data-active") !== "false");
  const observer = new MutationObserver(() =>
    apply(bar.getAttribute("data-active") !== "false"),
  );
  observer.observe(bar, { attributes: true, attributeFilter: ["data-active"] });
  return () => {
    observer.disconnect();
    window.clearTimeout(showTimer);
    cancelMotion();
  };
}

export function LoadingBar({
  containerRef,
  active = true,
  class: className,
  style,
}: LoadingBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const attachBar = useForwardedRef(containerRef, (element) => {
    barRef.current = element;
  });
  const segmentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const segment = segmentRef.current;
    if (!bar || !segment) return;
    return driveLoadingBar(bar, segment);
  }, []);

  return (
    <div
      ref={attachBar}
      role="progressbar"
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
