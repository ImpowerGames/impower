import { useRef } from "preact/hooks";
import { DOUBLE_TAP_SCALE, useImageZoom } from "./useImageZoom";

export type ImagePreviewProps = {
  src: string;
  alt?: string;
};

/**
 * Zoomable/pannable image preview. Scroll-wheel zooms toward the cursor,
 * two-finger pinch zooms toward the finger midpoint, drag pans when zoomed, and
 * double-click toggles between fit and {@link DOUBLE_TAP_SCALE}×. The image
 * fits the container (object-contain) at scale 1.
 */
export default function ImagePreview({ src, alt }: ImagePreviewProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const zoom = useImageZoom(ref, src);

  return (
    <div
      ref={ref}
      class="relative flex-1 select-none overflow-hidden [touch-action:none]"
      style={{ cursor: zoom.scale > 1 ? "grab" : "zoom-in" }}
      onPointerDown={zoom.onPointerDown}
      onPointerMove={zoom.onPointerMove}
      onPointerUp={zoom.onPointerUp}
      onPointerCancel={zoom.onPointerUp}
      onDblClick={(e) => {
        const el = ref.current;
        if (!el) {
          return;
        }
        if (zoom.scale > 1) {
          zoom.reset();
          return;
        }
        const r = el.getBoundingClientRect();
        zoom.zoomToPoint(DOUBLE_TAP_SCALE, e.clientX - r.left, e.clientY - r.top);
      }}
    >
      <div
        class="absolute inset-0 origin-top-left will-change-transform"
        style={{ transform: zoom.transform }}
      >
        <img
          src={src}
          alt={alt ?? ""}
          draggable={false}
          class="size-full object-contain"
        />
      </div>
    </div>
  );
}
