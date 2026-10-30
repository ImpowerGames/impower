import { useCallback, useEffect, useRef, useState } from "preact/hooks";

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const WHEEL_ZOOM_SPEED = 0.0015;
const DOUBLE_TAP_SCALE = 2.5;

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY: Transform = { scale: 1, tx: 0, ty: 0 };

export interface ImageZoom {
  transform: string;
  scale: number;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  reset: () => void;
  zoomToPoint: (scale: number, fx: number, fy: number) => void;
}

export function useImageZoom(
  containerRef: { current: HTMLElement | null },
  resetKey: unknown,
): ImageZoom {
  const [t, setT] = useState<Transform>(IDENTITY);
  const tRef = useRef(t);
  tRef.current = t;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);

  useEffect(() => {
    setT(IDENTITY);
    pointers.current.clear();
    pinch.current = null;
  }, [resetKey]);

  const clamp = useCallback(
    (next: Transform): Transform => {
      const el = containerRef.current;
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next.scale));
      if (!el) {
        return { scale: s, tx: next.tx, ty: next.ty };
      }
      const w = el.clientWidth;
      const h = el.clientHeight;
      return {
        scale: s,
        tx: Math.max(w * (1 - s), Math.min(0, next.tx)),
        ty: Math.max(h * (1 - s), Math.min(0, next.ty)),
      };
    },
    [containerRef],
  );

  const zoomToPoint = useCallback(
    (rawScale: number, fx: number, fy: number) => {
      setT((prev) => {
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));
        const lx = (fx - prev.tx) / prev.scale;
        const ly = (fy - prev.ty) / prev.scale;
        return clamp({ scale, tx: fx - lx * scale, ty: fy - ly * scale });
      });
    },
    [clamp],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED);
      zoomToPoint(
        tRef.current.scale * factor,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, zoomToPoint]);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) {
        return;
      }
      el.setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = {
          startDist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1,
          startScale: tRef.current.scale,
        };
      }
    },
    [containerRef],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el || !pointers.current.has(e.pointerId)) {
        return;
      }
      const prevPt = pointers.current.get(e.pointerId)!;
      const dx = e.clientX - prevPt.x;
      const dy = e.clientY - prevPt.y;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size >= 2 && pinch.current) {
        const rect = el.getBoundingClientRect();
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
        zoomToPoint(
          pinch.current.startScale * (dist / pinch.current.startDist),
          (a!.x + b!.x) / 2 - rect.left,
          (a!.y + b!.y) / 2 - rect.top,
        );
      } else if (pointers.current.size === 1) {
        setT((prev) => clamp({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
      }
    },
    [containerRef, zoomToPoint, clamp],
  );

  const onPointerUp = useCallback((e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      pinch.current = null;
    }
  }, []);

  const reset = useCallback(() => setT(IDENTITY), []);

  return {
    transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`,
    scale: t.scale,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    reset,
    zoomToPoint,
  };
}

export { DOUBLE_TAP_SCALE };
