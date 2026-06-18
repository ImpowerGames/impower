import { useRef, useState } from "preact/hooks";

// Custom pointer-events drag for the file tree, replacing native HTML5 DnD.
// Native DnD gives us a browser-generated "ghost" we can't fully control and
// doesn't fire on touch at all; this engine renders our own floating proxy and
// works for mouse, pen, and touch with a single code path.
//
// Activation:
//   - mouse/pen: arm once the pointer moves MOUSE_ARM_PX from the press point
//     (so a plain click still selects/opens).
//   - touch: arm on a TOUCH_LONGPRESS_MS long-press; if the finger moves more
//     than TOUCH_CANCEL_PX before that, it's a scroll — bail and let the list
//     scroll normally.
const MOUSE_ARM_PX = 6;
const TOUCH_LONGPRESS_MS = 350;
const TOUCH_CANCEL_PX = 12;
// Auto-scroll when the pointer is within this many px of the scroller's top or
// bottom edge while dragging; speed ramps toward EDGE_MAX_SPEED at the very edge.
const EDGE_ZONE_PX = 64;
const EDGE_MAX_SPEED = 16;

export type TreeDragRow = {
  /** Project-relative path of the row (its drag identity). */
  path: string;
  /** Folders are valid drop targets; files are not. */
  isDirectory: boolean;
  /** Display label shown inside the floating drag proxy. */
  label: string;
};

export type TreeDrag = {
  /** Path of the row currently being dragged (render it at reduced opacity). */
  draggingPath: string | null;
  /** Folder path currently hovered as a drop target (ring it), or null. */
  dropTarget: string | null;
  /** Floating proxy position + label, or null when not dragging. */
  proxy: { x: number; y: number; label: string } | null;
  /** Attach to each row's wrapper `onPointerDown`. */
  onRowPointerDown: (e: PointerEvent, row: TreeDragRow) => void;
};

type DragInternal = {
  row: TreeDragRow;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  armed: boolean;
  pointerType: string;
  longPressTimer: number | null;
};

type TreeDragOpts = {
  scrollRef: { current: HTMLElement | null };
  /** Move `srcPath` into `folderPath`. */
  onDropInto: (folderPath: string, srcPath: string) => void;
  /** Move `srcPath` to the project root. */
  onDropToRoot: (srcPath: string) => void;
};

// A folder is a legal target unless it's the dragged item itself or one of its
// descendants (can't move a folder inside itself).
const canDropInto = (folderPath: string, srcPath: string) =>
  folderPath !== srcPath && !folderPath.startsWith(`${srcPath}/`);

export function useTreeDrag(opts: TreeDragOpts): TreeDrag {
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [proxy, setProxy] = useState<TreeDrag["proxy"]>(null);
  const stateRef = useRef<DragInternal | null>(null);
  const edgeScrollRef = useRef<{ raf: number; dir: number } | null>(null);
  // Latest opts (scrollRef + drop callbacks) read by the stable handlers.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // The pointer handlers are built ONCE and kept referentially stable. This is
  // essential: they're attached to `window` on pointerdown and detached on
  // cleanup, and the component re-renders repeatedly DURING a drag (setProxy /
  // setDropTarget). If the handlers were rebuilt each render, removeEventListener
  // would pass a different function than was added — the listeners (and the
  // edge-auto-scroll loop) would leak and a missed pointerup could wedge
  // scrolling. Stable handlers + the safety nets below keep that from happening.
  const apiRef = useRef<{
    onRowPointerDown: (e: PointerEvent, row: TreeDragRow) => void;
  } | null>(null);

  if (!apiRef.current) {
    const stopEdgeScroll = () => {
      if (edgeScrollRef.current) {
        cancelAnimationFrame(edgeScrollRef.current.raf);
        edgeScrollRef.current = null;
      }
    };

    const updateEdgeScroll = (clientY: number) => {
      const el = optsRef.current.scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let dir = 0;
      let speed = 0;
      if (clientY < rect.top + EDGE_ZONE_PX) {
        dir = -1;
        speed = (rect.top + EDGE_ZONE_PX - clientY) / EDGE_ZONE_PX;
      } else if (clientY > rect.bottom - EDGE_ZONE_PX) {
        dir = 1;
        speed = (clientY - (rect.bottom - EDGE_ZONE_PX)) / EDGE_ZONE_PX;
      }
      if (dir === 0) {
        stopEdgeScroll();
        return;
      }
      const step = dir * Math.ceil(Math.min(1, speed) * EDGE_MAX_SPEED);
      if (edgeScrollRef.current) {
        edgeScrollRef.current.dir = step;
        return;
      }
      const tick = () => {
        const s = edgeScrollRef.current;
        const node = optsRef.current.scrollRef.current;
        if (!s || !node) return;
        node.scrollTop += s.dir;
        s.raf = requestAnimationFrame(tick);
      };
      edgeScrollRef.current = { dir: step, raf: requestAnimationFrame(tick) };
    };

    const hitDropTarget = (x: number, y: number, srcPath: string) => {
      const el = document.elementFromPoint(x, y);
      const rowEl = el?.closest<HTMLElement>("[data-tree-row]");
      if (rowEl && rowEl.dataset.dir === "1") {
        const path = rowEl.dataset.path ?? "";
        if (canDropInto(path, srcPath)) return path;
      }
      return null;
    };

    const cleanup = () => {
      const st = stateRef.current;
      if (st?.longPressTimer != null) clearTimeout(st.longPressTimer);
      stopEdgeScroll();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      stateRef.current = null;
      setDraggingPath(null);
      setDropTarget(null);
      setProxy(null);
    };

    const arm = () => {
      const st = stateRef.current;
      if (!st || st.armed) return;
      st.armed = true;
      if (st.longPressTimer != null) {
        clearTimeout(st.longPressTimer);
        st.longPressTimer = null;
      }
      setDraggingPath(st.row.path);
      setProxy({ x: st.lastX, y: st.lastY, label: st.row.label });
    };

    function onMove(e: PointerEvent) {
      const st = stateRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      // Safety net: a mouse/pen pointerup can be missed (released off-window,
      // focus lost, a swallowed event). If no button is held during a move, the
      // press is over — bail so we never leave the drag (and its edge-scroll
      // loop) wedged, which would fight the wheel. Touch reports buttons=1 only
      // while in contact, so it's covered by pointerup/cancel instead.
      if (st.pointerType !== "touch" && e.buttons === 0) {
        cleanup();
        return;
      }
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const dist = Math.hypot(dx, dy);

      if (!st.armed) {
        if (st.pointerType === "touch") {
          // Movement before the long-press fires = a scroll gesture: bail.
          if (dist > TOUCH_CANCEL_PX) cleanup();
        } else if (dist > MOUSE_ARM_PX) {
          arm();
        }
        return;
      }

      // Armed: drive the proxy + drop target, and suppress scrolling/selection.
      e.preventDefault();
      setProxy({ x: e.clientX, y: e.clientY, label: st.row.label });
      setDropTarget(hitDropTarget(e.clientX, e.clientY, st.row.path));
      updateEdgeScroll(e.clientY);
    }

    // After an armed drag, the browser may still fire a `click` on the source
    // row — swallow exactly one so dragging a file doesn't also open it.
    const suppressNextClick = () => {
      const onClickCapture = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener("click", onClickCapture, true);
        clearTimeout(timer);
      };
      window.addEventListener("click", onClickCapture, true);
      const timer = window.setTimeout(
        () => window.removeEventListener("click", onClickCapture, true),
        350,
      );
    };

    function onUp(e: PointerEvent) {
      const st = stateRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      if (st.armed) {
        const target = hitDropTarget(e.clientX, e.clientY, st.row.path);
        if (target != null) {
          optsRef.current.onDropInto(target, st.row.path);
        } else {
          // Dropped on the background or a file row → move to project root.
          optsRef.current.onDropToRoot(st.row.path);
        }
        suppressNextClick();
      }
      cleanup();
    }

    // pointercancel + window blur (alt-tab / focus loss) both abort the drag.
    function onCancel() {
      cleanup();
    }

    const onRowPointerDown = (e: PointerEvent, row: TreeDragRow) => {
      // Left button only for mouse; ignore if a drag is already in flight.
      if (e.button != null && e.button > 0) return;
      if (stateRef.current) cleanup();
      stateRef.current = {
        row,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        armed: false,
        pointerType: e.pointerType,
        longPressTimer:
          e.pointerType === "touch"
            ? window.setTimeout(arm, TOUCH_LONGPRESS_MS)
            : null,
      };
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("blur", onCancel);
    };

    apiRef.current = { onRowPointerDown };
  }

  return {
    draggingPath,
    dropTarget,
    proxy,
    onRowPointerDown: apiRef.current.onRowPointerDown,
  };
}
