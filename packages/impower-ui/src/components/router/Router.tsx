import type { ComponentChildren, VNode } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

type RouterMode = "fade" | "slide-x";

export type RouterProps = {
  /** The key of the child to display. Must match one of the children's `key` prop. */
  active: string;
  /**
   * Transition style:
   * - `fade` (default) — old fades out, content swaps, new fades in.
   * - `slide-x` — same fade + a subtle horizontal slide. Direction
   *   inferred from key order: moving to a later key slides left.
   */
  mode?: RouterMode;
  /**
   * One element per route. Each must have a `key` prop. Only the
   * one whose key matches `active` is mounted; changing `active`
   * runs an exit-then-enter animation with a content swap in the
   * middle.
   */
  children: ComponentChildren;
};

/* Mirrors sparkle's `<s-router>` timing — `--theme-animation-exit-fade`
 * was 75ms linear and `--theme-animation-exit-left` was 150ms cubic-
 * bezier(0.4,0,0.2,1). The transform runs twice as long as the fade
 * so the slide continues smoothly across the (invisible-because-
 * opacity-0) content swap; the enter transform starts with a -75ms
 * delay (effectively at its 50% mark) to create the illusion of one
 * continuous slide motion despite the swap. */
const FADE_MS = 75;
const TRANSFORM_MS = 150;
const FADE_EASING = "linear";
const TRANSFORM_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
// Subtle 32px slide — sparkle's `exit-left` translates by translateX(-32px),
// not by the full panel width. Keeps the transition decorative rather
// than a hard pane replacement.
const SLIDE_DIST_PX = 32;

type Phase =
  | { kind: "idle" }
  | { kind: "exit"; target: string; dir: 1 | -1 }
  | { kind: "enter"; dir: 1 | -1 };

/**
 * Animated route container — single slot, content swaps mid-transition.
 *
 * Structure mirrors sparkle's `<s-router>`:
 *
 *     <scrim>           clip-overflow / position
 *       <fade>          opacity animation runs here (75ms)
 *         <transform>   transform animation runs here (150ms)
 *           {child}     current renderedKey only — single mount
 *         </transform>
 *       </fade>
 *     </scrim>
 *
 * Why two nested wrappers: fade and transform have different durations
 * and easings, so they need separate animation targets. Putting both
 * animations on one element would force a single duration and easing.
 *
 * Why one child instead of two: a cross-fade between two simultaneously-
 * mounted panes ghosts visibly (you can read both panes' text at once
 * mid-transition). Single-mount eliminates the overlap; the fade-out
 * → swap → fade-in sequence reads as a single smooth fade.
 *
 * The slide continuity trick (slide-x mode):
 *   - Exit fade: 75ms (1 → 0)
 *   - Exit transform: 150ms (0 → -32px)  ← continues past the fade
 *   - Content swap when fade reaches 0 (slot invisible)
 *   - Enter transform: 150ms with -75ms delay (starts at +32px → 0,
 *                       but immediately at its 50% mark which is
 *                       ~+16px after easing)
 *   - Enter fade: 75ms (0 → 1)
 *
 * Total transition: 150ms. The transform position jump at the swap
 * (from ~-22px to ~+16px) is invisible because opacity is 0 at that
 * moment, so visually it reads as continuous leftward motion.
 */
export default function Router({
  active,
  mode = "fade",
  children,
}: RouterProps) {
  const kids: VNode[] = Array.isArray(children)
    ? (children.filter(
        (c) => c && typeof c === "object" && "key" in c,
      ) as VNode[])
    : children && typeof children === "object" && "key" in (children as object)
      ? [children as VNode]
      : [];
  const keys = kids.map((c) => String(c.key ?? ""));

  const [renderedKey, setRenderedKey] = useState(active);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const fadeRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<HTMLDivElement | null>(null);
  const animsRef = useRef<Animation[]>([]);

  // Watch `active` and kick off an exit when it diverges.
  useEffect(() => {
    if (active === renderedKey && phase.kind === "idle") return;
    if (phase.kind === "exit" && phase.target === active) return;

    const oldIdx = keys.indexOf(renderedKey);
    const newIdx = keys.indexOf(active);
    if (newIdx < 0) return;
    const dir: 1 | -1 = newIdx > oldIdx ? 1 : -1;
    setPhase({ kind: "exit", target: active, dir });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Drive animations off of `phase` transitions.
  useEffect(() => {
    const fade = fadeRef.current;
    const xform = transformRef.current;
    if (!fade || !xform) return;

    // Cancel any in-flight animations before starting new ones.
    for (const a of animsRef.current) a.cancel();
    animsRef.current = [];

    if (phase.kind === "idle") {
      fade.style.opacity = "";
      xform.style.transform = "";
      return;
    }

    if (phase.kind === "exit") {
      const fadeAnim = fade.animate(
        { opacity: [1, 0] },
        { duration: FADE_MS, easing: FADE_EASING, fill: "forwards" },
      );
      animsRef.current.push(fadeAnim);

      if (mode === "slide-x") {
        const xformAnim = xform.animate(
          {
            transform: [
              "translateX(0)",
              `translateX(${-SLIDE_DIST_PX * phase.dir}px)`,
            ],
          },
          {
            duration: TRANSFORM_MS,
            easing: TRANSFORM_EASING,
            fill: "forwards",
          },
        );
        animsRef.current.push(xformAnim);
      }

      let cancelled = false;
      fadeAnim.finished.then(
        () => {
          if (cancelled) return;
          // Swap content while invisible, then move into enter phase.
          setRenderedKey(phase.target);
          setPhase({ kind: "enter", dir: phase.dir });
        },
        () => {
          /* cancelled */
        },
      );

      return () => {
        cancelled = true;
      };
    }

    if (phase.kind === "enter") {
      const fadeAnim = fade.animate(
        { opacity: [0, 1] },
        { duration: FADE_MS, easing: FADE_EASING, fill: "forwards" },
      );
      animsRef.current.push(fadeAnim);

      if (mode === "slide-x") {
        const xformAnim = xform.animate(
          {
            transform: [
              `translateX(${SLIDE_DIST_PX * phase.dir}px)`,
              "translateX(0)",
            ],
          },
          {
            duration: TRANSFORM_MS,
            easing: TRANSFORM_EASING,
            // Negative delay — animation effectively starts already
            // 50% through, so the slide picks up mid-motion right
            // where the exit slide left off. Mirrors sparkle's
            // `--theme-animation-enter-left: enter-left 150ms -75ms`.
            delay: -FADE_MS,
            fill: "forwards",
          },
        );
        animsRef.current.push(xformAnim);
      }

      let cancelled = false;
      fadeAnim.finished.then(
        () => {
          if (cancelled) return;
          setPhase({ kind: "idle" });
        },
        () => {
          /* cancelled */
        },
      );

      return () => {
        cancelled = true;
      };
    }

    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const child = kids.find((c) => String(c.key ?? "") === renderedKey);

  return (
    <div class="relative flex h-full w-full flex-col overflow-hidden">
      <div ref={fadeRef} class="flex flex-1 flex-col min-h-0">
        <div
          ref={transformRef}
          class="flex flex-1 flex-col min-h-0"
        >
          {child}
        </div>
      </div>
    </div>
  );
}
