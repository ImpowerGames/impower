import { useEffect, useRef } from "preact/hooks";

const PRESS_GROW_MS = 450;
const MINIMUM_PRESS_MS = 225;
const INITIAL_ORIGIN_SCALE = 0.2;
const PADDING = 10;
const SOFT_EDGE_MINIMUM_SIZE = 75;
const SOFT_EDGE_CONTAINER_RATIO = 0.35;
const PRESS_EASE = "cubic-bezier(0.2, 0, 0, 1)";
const PRESS_OPACITY = 0.12;
const FADE_MS = 150;

interface RippleSurface extends HTMLSpanElement {
  __growAnim?: Animation;
  __growStart?: number;
  __ended?: boolean;
}

export default function Ripple() {
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const host = container?.parentElement;
    if (!container || !host) return;

    let currentRipple: RippleSurface | null = null;

    const startRipple = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (currentRipple) endRipple(currentRipple, true);

      const rect = host.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const maxDim = Math.max(width, height);
      const softEdge = Math.max(
        SOFT_EDGE_CONTAINER_RATIO * maxDim,
        SOFT_EDGE_MINIMUM_SIZE,
      );
      const initialSize = Math.floor(maxDim * INITIAL_ORIGIN_SCALE);
      const hypotenuse = Math.hypot(width, height);
      const maxRadius = hypotenuse + PADDING;
      const rippleScale = (maxRadius + softEdge) / initialSize;

      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      const startX = pointerX - initialSize / 2;
      const startY = pointerY - initialSize / 2;
      const endX = (width - initialSize) / 2;
      const endY = (height - initialSize) / 2;

      const wave = document.createElement("span") as RippleSurface;
      const style = wave.style;
      style.position = "absolute";
      style.left = "0";
      style.top = "0";
      style.width = `${initialSize}px`;
      style.height = `${initialSize}px`;
      style.borderRadius = "50%";
      style.backgroundColor = "currentColor";
      style.opacity = String(PRESS_OPACITY);
      style.pointerEvents = "none";
      style.willChange = "transform, opacity";
      style.transform = `translate(${startX}px, ${startY}px) scale(1)`;

      container.appendChild(wave);
      wave.__growStart = performance.now();
      wave.__growAnim = wave.animate(
        {
          transform: [
            `translate(${startX}px, ${startY}px) scale(1)`,
            `translate(${endX}px, ${endY}px) scale(${rippleScale})`,
          ],
        },
        {
          duration: PRESS_GROW_MS,
          easing: PRESS_EASE,
          fill: "forwards",
        },
      );
      currentRipple = wave;
    };

    const endRipple = async (wave: RippleSurface, force = false) => {
      if (wave.__ended) return;
      wave.__ended = true;
      const elapsed = performance.now() - (wave.__growStart ?? 0);
      if (!force && elapsed < MINIMUM_PRESS_MS) {
        await new Promise((r) => setTimeout(r, MINIMUM_PRESS_MS - elapsed));
      }
      const fade = wave.animate(
        { opacity: [String(wave.style.opacity || PRESS_OPACITY), "0"] },
        { duration: FADE_MS, easing: "linear", fill: "forwards" },
      );
      try {
        await fade.finished;
      } catch {
      }
      wave.remove();
      if (currentRipple === wave) currentRipple = null;
    };

    const onPointerDown = (e: PointerEvent) => startRipple(e);
    const onPointerUp = () => {
      if (currentRipple) void endRipple(currentRipple);
    };
    const onPointerLeave = () => {
      if (currentRipple) void endRipple(currentRipple);
    };

    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointerup", onPointerUp);
    host.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerup", onPointerUp);
      if (currentRipple) {
        currentRipple.__growAnim?.cancel();
        currentRipple.remove();
        currentRipple = null;
      }
    };
  }, []);

  return (
    <span
      ref={containerRef}
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ borderRadius: "inherit" }}
    />
  );
}
