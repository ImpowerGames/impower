import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cn } from "../../utils/cn";
import { ExpandIcon, MinusIcon, PlusIcon } from "../icon/icons.generated";

export type Zoom = { scale: number; x: number; y: number };

export const ZOOM_FIT: Zoom = { scale: 1, x: 0, y: 0 };

export const ZOOM_LEVELS: readonly number[] = [1, 1.5, 2, 3, 4, 6, 8, 10];

export const ZOOM_MAX = 10;

export const ZOOM_DOUBLE_CLICK = 2;

export const ZOOM_HELP =
  "Zoom with the zoom buttons, a pinch, a double click or the plus and minus keys. Drag, move two fingers, or use the arrow keys to move. Press 0 to fit.";

const PAN_STEP = 0.1;
const WHEEL_SPEED = 0.01;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DISTANCE = 30;
const TAP_MS = 300;
const TAP_SLOP = 10;
const TOUCH_CLICK_MS = 600;

const clampScale = (scale: number) => Math.min(ZOOM_MAX, Math.max(1, scale));

export const clampZoom = ({ scale, x, y }: Zoom): Zoom => {
  const s = clampScale(scale);
  if (s === 1) {
    return ZOOM_FIT;
  }
  return {
    scale: s,
    x: Math.min(0, Math.max(1 - s, x)),
    y: Math.min(0, Math.max(1 - s, y)),
  };
};

export const zoomAbout = (zoom: Zoom, px: number, py: number, scale: number): Zoom => {
  const s = clampScale(scale);
  return clampZoom({
    scale: s,
    x: px - ((px - zoom.x) * s) / zoom.scale,
    y: py - ((py - zoom.y) * s) / zoom.scale,
  });
};

export const zoomStep = (zoom: Zoom, direction: 1 | -1): Zoom => {
  const next =
    direction > 0
      ? (ZOOM_LEVELS.find((level) => level > zoom.scale + 0.01) ?? ZOOM_MAX)
      : ([...ZOOM_LEVELS].reverse().find((level) => level < zoom.scale - 0.01) ?? 1);
  return zoomAbout(zoom, 0.5, 0.5, next);
};

export const zoomPan = (zoom: Zoom, dx: number, dy: number): Zoom =>
  clampZoom({ scale: zoom.scale, x: zoom.x + dx, y: zoom.y + dy });

export const zoomPercent = (zoom: Zoom) => `${Math.round(zoom.scale * 100)}%`;

export const zoomLabel = (zoom: Zoom) =>
  zoom.scale > 1 ? `Zoom ${zoomPercent(zoom)}, fit to frame` : "Zoom 100%";

const ARROW_PANS: Record<string, readonly [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

export const zoomFrameVariants = cva(
  "relative flex-none overflow-hidden aspect-(--frame-ratio)",
  {
    variants: {
      fit: {
        pane: "w-full rounded-[10px] max-h-[40vh] [:root[data-layout=desktop]_&]:max-h-[44vh]",
        screen: "w-[min(100vw,calc(100dvh*var(--frame-ratio)))] max-h-dvh rounded-none",
      },
      surface: {
        stage: "bg-stage",
        sheet: "border border-edge bg-bg",
      },
      zoomable: {
        true: "touch-pan-y select-none outline-offset-2 data-[zoomed]:cursor-grab data-[dragging]:cursor-grabbing",
        false: "",
      },
    },
    defaultVariants: { fit: "pane", surface: "stage", zoomable: false },
  },
);

export const zoomFrameContentVariants = cva("relative mx-auto h-full max-w-full aspect-(--frame-ratio)");

const zoomButtonVariants = cva(
  [
    "relative grid size-8 cursor-pointer place-items-center rounded-full text-inherit",
    "before:absolute before:-inset-1.5 before:content-[''] before:pointer-events-auto",
    "control-overlay disabled:cursor-default disabled:opacity-35 [&>svg]:size-[15px]",
  ],
  {
    variants: {
      kind: {
        step: "",
        level: "w-auto min-w-11 px-1 text-[12px] tabular-nums",
      },
    },
    defaultVariants: { kind: "step" },
  },
);

const zoomExpandVariants = cva([
  "absolute right-1.5 bottom-1.5 z-[1] grid size-11 cursor-pointer place-items-center rounded-full",
  "border-2 border-transparent bg-media-badge bg-clip-padding text-media-badge-ink control-overlay [&>svg]:size-[18px]",
]);

export type ZoomFrameFit = NonNullable<VariantProps<typeof zoomFrameVariants>["fit"]>;
export type ZoomFrameSurface = NonNullable<VariantProps<typeof zoomFrameVariants>["surface"]>;

export type ZoomFrameProps = {
  label: string;
  ratio?: number;
  fit?: ZoomFrameFit;
  surface?: ZoomFrameSurface;
  zoomable?: boolean;
  expandLabel?: string;
  onExpand?: () => void;
  class?: string;
  children?: ComponentChildren;
};

type Point = readonly [number, number];

type Gesture = { from: Zoom; points: Point[] };

export default function ZoomFrame({
  label,
  ratio,
  fit,
  surface,
  zoomable = false,
  expandLabel = "View full size",
  onExpand,
  class: className,
  children,
}: ZoomFrameProps) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoomState] = useState<Zoom>(ZOOM_FIT);
  const current = useRef(zoom);
  const [dragging, setDragging] = useState(false);
  const pan = useRef<{ id: number; from: Zoom; start: Point } | null>(null);
  const touchedAt = useRef(-Infinity);

  const setZoom = (next: Zoom) => {
    current.current = next;
    setZoomState(next);
  };

  const within = (clientX: number, clientY: number): Point => {
    const rect = frame.current!.getBoundingClientRect();
    return [
      rect.width ? (clientX - rect.left) / rect.width : 0.5,
      rect.height ? (clientY - rect.top) / rect.height : 0.5,
    ];
  };

  const toggle = (point: Point) =>
    setZoom(
      current.current.scale > 1
        ? ZOOM_FIT
        : zoomAbout(current.current, point[0], point[1], ZOOM_DOUBLE_CLICK),
    );

  useEffect(() => {
    const element = frame.current;
    if (!zoomable || !element) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const [px, py] = within(event.clientX, event.clientY);
      setZoom(
        zoomAbout(
          current.current,
          px,
          py,
          current.current.scale * Math.exp(-event.deltaY * unit * WHEEL_SPEED),
        ),
      );
    };
    let gesture: Gesture | null = null;
    let tap: { x: number; y: number; at: number } | null = null;
    let lastTap: { x: number; y: number; at: number } | null = null;
    const fingers = (touches: TouchList): Point[] =>
      Array.from(touches)
        .filter((touch) => element.contains(touch.target as Node))
        .map((touch) => within(touch.clientX, touch.clientY));
    const begin = (touches: TouchList) => {
      const points = fingers(touches);
      gesture = points.length >= 2 ? { from: current.current, points } : null;
    };
    const onTouchStart = (event: TouchEvent) => {
      if ((event.target as Element).closest?.("[data-zoom-controls]")) {
        return;
      }
      begin(event.touches);
      const touch = event.touches[0]!;
      tap =
        event.touches.length === 1
          ? { x: touch.clientX, y: touch.clientY, at: event.timeStamp }
          : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (tap && touch && Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > TAP_SLOP) {
        tap = null;
      }
      if (!gesture || !event.cancelable) {
        return;
      }
      event.preventDefault();
      const now = fingers(event.touches);
      const { from, points } = gesture;
      if (now.length < 2 || points.length < 2) {
        return;
      }
      const [a, b] = [points[0]!, points[1]!];
      const [c, d] = [now[0]!, now[1]!];
      const gap = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      const s = clampScale((from.scale * gap(c, d)) / gap(a, b));
      const [m0x, m0y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const [mx, my] = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
      setZoom(
        clampZoom({
          scale: s,
          x: mx - ((m0x - from.x) * s) / from.scale,
          y: my - ((m0y - from.y) * s) / from.scale,
        }),
      );
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (gesture) {
        begin(event.touches);
      }
      if (!tap || event.touches.length || event.type !== "touchend") {
        return;
      }
      const touch = event.changedTouches[0]!;
      if (event.timeStamp - tap.at < TAP_MS) {
        if (
          lastTap &&
          event.timeStamp - lastTap.at < DOUBLE_TAP_MS &&
          Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < DOUBLE_TAP_DISTANCE
        ) {
          toggle(within(touch.clientX, touch.clientY));
          touchedAt.current = event.timeStamp;
          lastTap = null;
        } else {
          lastTap = { x: touch.clientX, y: touch.clientY, at: event.timeStamp };
        }
      }
      tap = null;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchEnd);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoomable]);

  const onControl = (event: Event) =>
    !!(event.target as Element | null)?.closest?.("[data-zoom-controls]");

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== frame.current || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const z = current.current;
    const arrow = ARROW_PANS[event.key];
    if (event.key === "+" || event.key === "=") {
      setZoom(zoomStep(z, 1));
    } else if (event.key === "-" || event.key === "_") {
      setZoom(zoomStep(z, -1));
    } else if (event.key === "0") {
      setZoom(ZOOM_FIT);
    } else if (arrow && z.scale > 1) {
      setZoom(zoomPan(z, (arrow[0] * PAN_STEP) / z.scale, (arrow[1] * PAN_STEP) / z.scale));
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const onDblClick = (event: MouseEvent) => {
    if (onControl(event) || event.timeStamp - touchedAt.current < TOUCH_CLICK_MS) {
      return;
    }
    toggle(within(event.clientX, event.clientY));
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch" || event.button !== 0 || onControl(event)) {
      return;
    }
    const element = frame.current!;
    event.preventDefault();
    element.focus({ preventScroll: true });
    element.setPointerCapture?.(event.pointerId);
    pan.current = {
      id: event.pointerId,
      from: current.current,
      start: within(event.clientX, event.clientY),
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    const held = pan.current;
    if (!held || held.id !== event.pointerId) {
      return;
    }
    const [x, y] = within(event.clientX, event.clientY);
    if (held.from.scale > 1) {
      setDragging(true);
    }
    setZoom(zoomPan(held.from, x - held.start[0], y - held.start[1]));
  };

  const endPan = (event: PointerEvent) => {
    if (pan.current?.id === event.pointerId) {
      pan.current = null;
      setDragging(false);
    }
  };

  const ratioStyle = { "--frame-ratio": String(ratio && ratio > 0 ? ratio : 16 / 9) };

  const interactive: JSX.HTMLAttributes<HTMLDivElement> = zoomable
    ? {
        tabIndex: 0,
        role: "group",
        "aria-roledescription": "zoomable picture",
        onKeyDown,
        onDblClick,
        onPointerDown,
        onPointerMove,
        onPointerUp: endPan,
        onPointerCancel: endPan,
        onLostPointerCapture: endPan,
      }
    : { role: "group" };

  return (
    <div
      ref={frame}
      class={cn(zoomFrameVariants({ fit, surface, zoomable }), className)}
      style={ratioStyle}
      data-zoom-frame
      data-zoomed={zoom.scale > 1 ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      aria-label={label}
      {...(zoomable ? { "aria-description": ZOOM_HELP } : {})}
      {...interactive}
    >
      <div
        class="absolute inset-0 origin-top-left"
        style={
          zoomable
            ? {
                transform: `translate(${(zoom.x * 100).toFixed(3)}%, ${(zoom.y * 100).toFixed(3)}%) scale(${zoom.scale.toFixed(4)})`,
              }
            : undefined
        }
      >
        <div class={zoomFrameContentVariants()}>{children}</div>
      </div>
      {zoomable && (
        <div
          role="group"
          aria-label="Zoom"
          data-zoom-controls
          class="absolute bottom-2 left-2 z-[1] flex h-[34px] cursor-default items-center rounded-full bg-media-badge px-0.5 text-media-badge-ink"
        >
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom.scale <= 1}
            class={zoomButtonVariants()}
            onClick={() => setZoom(zoomStep(current.current, -1))}
          >
            <MinusIcon />
          </button>
          <button
            type="button"
            aria-label={zoomLabel(zoom)}
            data-zoom-level
            class={zoomButtonVariants({ kind: "level" })}
            onClick={() => setZoom(ZOOM_FIT)}
          >
            {zoomPercent(zoom)}
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom.scale >= ZOOM_MAX}
            class={zoomButtonVariants()}
            onClick={() => setZoom(zoomStep(current.current, 1))}
          >
            <PlusIcon />
          </button>
        </div>
      )}
      {onExpand && (
        <button
          type="button"
          aria-label={expandLabel}
          aria-haspopup="dialog"
          title={expandLabel}
          data-zoom-controls
          data-zoom-expand
          class={zoomExpandVariants()}
          onClick={onExpand}
        >
          <ExpandIcon />
        </button>
      )}
    </div>
  );
}
