import type { ComponentChildren, VNode } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

type RouterMode = "fade" | "slide-x" | "zoom";

export type RouterProps = {
  active: string;
  mode?: RouterMode;
  children: ComponentChildren;
};

const FADE_MS = 75;
const TRANSFORM_MS = 150;
const SLIDE_FADE_MS = 110;
const SLIDE_TRANSFORM_MS = 220;
const FADE_EASING = "linear";
const TRANSFORM_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const SLIDE_DIST_PX = 32;

type Phase =
  | { kind: "idle" }
  | { kind: "exit"; target: string; dir: 1 | -1 }
  | { kind: "enter"; dir: 1 | -1 };

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

  useEffect(() => {
    const fade = fadeRef.current;
    const xform = transformRef.current;
    if (!fade || !xform) return;

    for (const a of animsRef.current) a.cancel();
    animsRef.current = [];

    const fadeMs = mode === "slide-x" ? SLIDE_FADE_MS : FADE_MS;
    const transformMs = mode === "slide-x" ? SLIDE_TRANSFORM_MS : TRANSFORM_MS;

    if (phase.kind === "idle") {
      fade.style.opacity = "";
      xform.style.transform = "";
      return;
    }

    if (phase.kind === "exit") {
      const fadeAnim = fade.animate(
        { opacity: [1, 0] },
        { duration: fadeMs, easing: FADE_EASING, fill: "forwards" },
      );
      animsRef.current.push(fadeAnim);

      let xformAnim: Animation | null = null;
      if (mode === "slide-x" || mode === "zoom") {
        const transform =
          mode === "slide-x"
            ? ["translateX(0)", `translateX(${-SLIDE_DIST_PX * phase.dir}px)`]
            : ["scale(1)", "scale(0.99)"];
        xformAnim = xform.animate(
          { transform },
          {
            duration: transformMs,
            easing: TRANSFORM_EASING,
            fill: "forwards",
          },
        );
        animsRef.current.push(xformAnim);
      }

      let cancelled = false;
      const swapGate =
        mode === "slide-x" || !xformAnim
          ? fadeAnim.finished
          : Promise.all([fadeAnim.finished, xformAnim.finished]);
      swapGate.then(
        () => {
          if (cancelled) return;
          setRenderedKey(phase.target);
          setPhase({ kind: "enter", dir: phase.dir });
        },
        () => {
        },
      );

      return () => {
        cancelled = true;
      };
    }

    if (phase.kind === "enter") {
      const fadeAnim = fade.animate(
        { opacity: [0, 1] },
        { duration: fadeMs, easing: FADE_EASING, fill: "forwards" },
      );
      animsRef.current.push(fadeAnim);

      let xformAnim: Animation | null = null;
      if (mode === "slide-x" || mode === "zoom") {
        const transform =
          mode === "slide-x"
            ? [`translateX(${SLIDE_DIST_PX * phase.dir}px)`, "translateX(0)"]
            : ["scale(0.99)", "scale(1)"];
        xformAnim = xform.animate(
          { transform },
          {
            duration: transformMs,
            easing: TRANSFORM_EASING,
            delay: mode === "slide-x" ? -fadeMs : 0,
            fill: "forwards",
          },
        );
        animsRef.current.push(xformAnim);
      }

      let cancelled = false;
      const enterGate = xformAnim
        ? Promise.all([fadeAnim.finished, xformAnim.finished])
        : fadeAnim.finished;
      enterGate.then(
        () => {
          if (cancelled) return;
          setPhase({ kind: "idle" });
        },
        () => {
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
    <div class="relative flex h-full w-full flex-col overflow-x-clip">
      <div ref={fadeRef} class="flex flex-1 flex-col min-h-0">
        <div
          ref={transformRef}
          class="flex flex-1 flex-col min-h-0"
          style={mode === "zoom" ? { transformOrigin: "top center" } : undefined}
        >
          {child}
        </div>
      </div>
    </div>
  );
}
