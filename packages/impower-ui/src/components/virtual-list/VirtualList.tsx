import { cva } from "class-variance-authority";
import type { ComponentChildren, JSX, Ref } from "preact";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { useForwardedRef } from "../../hooks/useForwardedRef";
import { useLayout } from "../../hooks/useLayout";
import { cn } from "../../utils/cn";

export const virtualListVariants = cva(
  "relative min-h-0 overflow-x-hidden overflow-y-auto [scrollbar-width:thin]",
);

export const VIRTUAL_LIST_ROW_HEIGHT = {
  default: 63,
  compact: 44,
  outline: 50,
  rail: 46,
} as const;

export const virtualListSlotVariants = cva("absolute", {
  variants: {
    size: {
      default: "inset-x-0 pb-[3px]",
      compact: "inset-x-0",
      outline: "inset-x-0 pb-[2px]",
      rail: "inset-x-0 *:h-11",
      cell: "",
    },
  },
  defaultVariants: { size: "default" },
});

export type VirtualListSize = keyof typeof VIRTUAL_LIST_ROW_HEIGHT;

export type VirtualListGrid = {
  class: string;
  height: (width: number) => number;
};

export type VirtualListTrack = { minWidth: number; gap: number };

export const virtualListColumns = (
  track: VirtualListTrack,
  width: number,
): { columns: number; width: number } => {
  const columns =
    track.minWidth > 0
      ? Math.max(1, Math.floor((width + track.gap) / (track.minWidth + track.gap)))
      : 1;
  return {
    columns,
    width:
      width > 0 ? (width - track.gap * (columns - 1)) / columns : track.minWidth,
  };
};

const pixels = (value: string) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const trackOf = (element: Element): VirtualListTrack => {
  const style = getComputedStyle(element);
  return {
    minWidth: pixels(style.getPropertyValue("--grid-min-width")),
    gap: pixels(style.getPropertyValue("--grid-gap")),
  };
};

const FIRST_PAINT_ROWS = 24;

export type VirtualListProps<T> = {
  items: readonly T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ComponentChildren;
  size?: VirtualListSize;
  overscan?: number;
  revealIndex?: number;
  revealRequest?: number;
  itemHeight?: (item: T, index: number) => number;
  grid?: VirtualListGrid;
  label?: string;
  class?: string;
  listRef?: Ref<HTMLDivElement>;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "size" | "label">;

export default function VirtualList<T>({
  items,
  getKey,
  renderItem,
  size = "default",
  overscan = 6,
  revealIndex,
  revealRequest,
  itemHeight,
  grid,
  label,
  class: className,
  listRef,
  ...rest
}: VirtualListProps<T>) {
  const rowHeight = VIRTUAL_LIST_ROW_HEIGHT[size];
  const layout = useLayout();
  const scroller = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ top: 0, height: 0, width: 0, minWidth: 0, gap: 0 });
  const cells = grid ? virtualListColumns(view, view.width) : undefined;
  const columns = cells?.columns ?? 1;
  const cellWidth = cells?.width ?? 0;
  const cellHeight = grid ? grid.height(cellWidth) : 0;
  const gap = grid ? view.gap : 0;
  const lines = Math.ceil(items.length / columns);
  const offsets = useMemo(() => {
    const tops = new Array<number>(lines + 1);
    tops[0] = 0;
    for (let index = 0; index < lines; index += 1) {
      tops[index + 1] =
        tops[index]! +
        (grid
          ? cellHeight + (index < lines - 1 ? gap : 0)
          : itemHeight
            ? itemHeight(items[index]!, index)
            : rowHeight);
    }
    return tops;
  }, [items, itemHeight, rowHeight, lines, !grid, cellHeight, gap]);
  const topOf = (line: number) => offsets[line]!;
  const lineAt = (offset: number) => {
    let low = 0;
    let high = lines;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (offsets[middle + 1]! <= offset) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  };

  const track = useRef<VirtualListTrack>({ minWidth: 0, gap: 0 });
  const measure = useRef((retrack: boolean) => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    if (retrack) {
      track.current = trackOf(element);
    }
    const width = element.firstElementChild?.clientWidth ?? 0;
    const { minWidth, gap: trackGap } = track.current;
    setView((prev) =>
      prev.top === element.scrollTop &&
      prev.height === element.clientHeight &&
      prev.width === width &&
      prev.minWidth === minWidth &&
      prev.gap === trackGap
        ? prev
        : {
            top: element.scrollTop,
            height: element.clientHeight,
            width,
            minWidth,
            gap: trackGap,
          },
    );
  });

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const onScroll = () => measure.current(false);
    const onResize = () => measure.current(true);
    onResize();
    element.addEventListener("scroll", onScroll, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(onResize);
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    measure.current(true);
  }, [grid?.class, layout]);

  const geometry = grid ? `grid:${columns}:${cellHeight}:${gap}` : "rows";
  const anchor = useRef<{ index: number; geometry: string; measured: boolean } | null>(null);

  useLayoutEffect(() => {
    const element = scroller.current;
    const list = element?.firstElementChild as HTMLElement | null | undefined;
    if (!element || !list) {
      return;
    }
    const origin = list.offsetTop;
    const last = anchor.current;
    if (last && last.measured && view.width > 0 && last.geometry !== geometry && last.index >= 0 && items.length) {
      element.scrollTop = topOf(Math.floor(Math.min(last.index, items.length - 1) / columns)) + origin;
      anchor.current = { index: last.index, geometry, measured: true };
      measure.current(false);
      return;
    }
    const offset = element.scrollTop - origin;
    anchor.current = {
      index: offset > 0 ? lineAt(offset + 1) * columns : -1,
      geometry,
      measured: view.width > 0,
    };
  });

  const hasViewport = view.height > 0;
  const revealedRequest = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !hasViewport || revealIndex == null || revealIndex < 0) {
      return;
    }
    if (revealIndex >= items.length) {
      return;
    }
    if (revealRequest !== undefined) {
      if (revealRequest === revealedRequest.current) {
        return;
      }
      revealedRequest.current = revealRequest;
    }
    const line = Math.floor(revealIndex / columns);
    const top = topOf(line);
    const bottom = grid ? top + cellHeight : topOf(line + 1);
    if (top < element.scrollTop) {
      element.scrollTop = top;
    } else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
  }, [revealIndex, revealRequest, rowHeight, hasViewport, columns]);

  const first = lineAt(view.top);
  const last = view.height
    ? lineAt(view.top + view.height - 1)
    : first + FIRST_PAINT_ROWS - 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(lines, start + last - first + 1 + overscan * 2);

  const setRef = useForwardedRef(listRef, (element: HTMLDivElement | null) => {
    scroller.current = element;
  });

  const rows: ComponentChildren[] = [];
  const endItem = Math.min(items.length, end * columns);
  for (let index = start * columns; index < endItem; index += 1) {
    const item = items[index]!;
    const line = Math.floor(index / columns);
    rows.push(
      <div
        key={getKey(item, index)}
        role="listitem"
        aria-setsize={items.length}
        aria-posinset={index + 1}
        class={virtualListSlotVariants({ size: grid ? "cell" : size })}
        style={
          grid
            ? {
                top: topOf(line),
                left: (index % columns) * (cellWidth + gap),
                width: cellWidth,
                height: cellHeight,
              }
            : { top: topOf(line), height: topOf(line + 1) - topOf(line) }
        }
      >
        {renderItem(item, index)}
      </div>,
    );
  }

  return (
    <div
      ref={setRef}
      class={cn(virtualListVariants(), grid?.class, className)}
      {...rest}
    >
      <div
        role="list"
        aria-label={label}
        class="relative w-full"
        style={{ height: topOf(lines) }}
      >
        {rows}
      </div>
    </div>
  );
}
