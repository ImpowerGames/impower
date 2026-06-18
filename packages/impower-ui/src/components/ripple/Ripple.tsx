import { useEffect, useRef } from "preact/hooks";

/**
 * Material-design ripple effect. Drop inside any `position: relative`,
 * `overflow: hidden` container (a button, a row, a tab) and it'll spawn an
 * expanding-circle animation at every pointerdown.
 *
 * Algorithm ported verbatim from `<s-ripple>` (Material Web Components):
 *   - initial size = 20% of max(width, height)
 *   - final scale  = (hypotenuse + 10 padding + softEdge) / initialSize
 *   - softEdge     = max(35% × maxDim, 75px)
 *   - the ripple TRANSLATES from the click point to the button center while
 *     scaling up — not a simple scale-from-point — so the wave appears to
 *     originate at the click and sweep into place.
 *   - duration 450ms, easing cubic-bezier(0.2, 0, 0, 1)
 *   - opacity held at 0.12 while pressed (matches --theme-opacity-press),
 *     fades to 0 on pointerup once a 225ms minimum-press duration is met
 *
 * Pairs with `hover:bg-foreground/5` (static --theme-opacity-hover layer)
 * — Ripple is the press-only radial wave; the hover layer is the
 * steady-state tint.
 */
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
      // Primary button only (left click / first finger).
      if (e.button !== 0) return;
      // If a previous ripple is still alive, end it immediately so the new
      // press takes over cleanly.
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
      // Center the initial-size circle on the click point.
      const startX = pointerX - initialSize / 2;
      const startY = pointerY - initialSize / 2;
      // End centered on the host.
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
      // Avoid a flash from the initial pre-animation transform.
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
      // Hold the pressed state until at least MINIMUM_PRESS_MS so a quick
      // tap still flashes a visible ripple. Skipped when `force` (a new
      // press is taking over).
      if (!force && elapsed < MINIMUM_PRESS_MS) {
        await new Promise((r) => setTimeout(r, MINIMUM_PRESS_MS - elapsed));
      }
      // Fade out.
      const fade = wave.animate(
        { opacity: [String(wave.style.opacity || PRESS_OPACITY), "0"] },
        { duration: FADE_MS, easing: "linear", fill: "forwards" },
      );
      try {
        await fade.finished;
      } catch {
        /* element removed mid-animation */
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
    // Window listeners catch the case where the pointer is released
    // outside the button (e.g. drag off then release).
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerup", onPointerUp);
      // Wipe any in-flight ripples so they don't outlive the unmount.
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
