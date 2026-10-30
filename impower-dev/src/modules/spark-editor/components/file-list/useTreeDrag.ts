import { useRef, useState } from "preact/hooks";

const MOUSE_ARM_PX = 6;
const TOUCH_LONGPRESS_MS = 350;
const TOUCH_CANCEL_PX = 12;
const EDGE_ZONE_PX = 64;
const EDGE_MAX_SPEED = 16;

export type TreeDragRow = {
  path: string;
  paths?: string[];
  isDirectory: boolean;
  label: string;
};

const dragPathsOf = (row: TreeDragRow): string[] =>
  row.paths && row.paths.length > 0 ? row.paths : [row.path];

export type TreeDrag = {
  draggingPath: string | null;
  dropTarget: string | null;
  proxy: { x: number; y: number; label: string } | null;
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
  onDropInto: (folderPath: string, srcPaths: string[]) => void;
  onDropToRoot: (srcPaths: string[]) => void;
};

const canDropInto = (folderPath: string, srcPaths: string[]) =>
  srcPaths.every(
    (src) => folderPath !== src && !folderPath.startsWith(`${src}/`),
  );

export function useTreeDrag(opts: TreeDragOpts): TreeDrag {
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [proxy, setProxy] = useState<TreeDrag["proxy"]>(null);
  const stateRef = useRef<DragInternal | null>(null);
  const edgeScrollRef = useRef<{ raf: number; dir: number } | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

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

    const hitDropTarget = (x: number, y: number, srcPaths: string[]) => {
      const el = document.elementFromPoint(x, y);
      const rowEl = el?.closest<HTMLElement>("[data-tree-row]");
      if (rowEl && rowEl.dataset["dir"] === "1") {
        const path = rowEl.dataset["path"] ?? "";
        if (canDropInto(path, srcPaths)) return path;
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
      // workaround(chromium): a mouse or pen pointerup can be missed when released off-window or on focus loss, so a buttonless move ends the drag
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
          if (dist > TOUCH_CANCEL_PX) cleanup();
        } else if (dist > MOUSE_ARM_PX) {
          arm();
        }
        return;
      }

      e.preventDefault();
      setProxy({ x: e.clientX, y: e.clientY, label: st.row.label });
      setDropTarget(hitDropTarget(e.clientX, e.clientY, dragPathsOf(st.row)));
      updateEdgeScroll(e.clientY);
    }

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
        const srcPaths = dragPathsOf(st.row);
        const target = hitDropTarget(e.clientX, e.clientY, srcPaths);
        if (target != null) {
          optsRef.current.onDropInto(target, srcPaths);
        } else {
          optsRef.current.onDropToRoot(srcPaths);
        }
        suppressNextClick();
      }
      cleanup();
    }

    function onCancel() {
      cleanup();
    }

    const onRowPointerDown = (e: PointerEvent, row: TreeDragRow) => {
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
