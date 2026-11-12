import { cva } from "class-variance-authority";
import type { ComponentChildren, JSX, Ref } from "preact";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { useForwardedRef } from "../../hooks/useForwardedRef";
import { cn } from "../../utils/cn";

export const virtualListVariants = cva(
  "relative min-h-0 overflow-x-hidden overflow-y-auto [scrollbar-width:thin]",
);

export const VIRTUAL_LIST_ROW_HEIGHT = {
  default: 63,
  compact: 44,
} as const;

export const virtualListSlotVariants = cva("absolute", {
  variants: {
    size: {
      default: "inset-x-0 pb-[3px]",
      compact: "inset-x-0",
      cell: "",
    },
  },
  defaultVariants: { size: "default" },
});

export type VirtualListSize = keyof typeof VIRTUAL_LIST_ROW_HEIGHT;

export type VirtualListGrid = {
  minWidth: number;
  gap: number;
  height: (width: number) => number;
};

export const virtualListColumns = (
  grid: VirtualListGrid,
  width: number,
): { columns: number; width: number } => {
  const columns = Math.max(
    1,
    Math.floor((width + grid.gap) / (grid.minWidth + grid.gap)),
  );
  return {
    columns,
    width:
      width > 0 ? (width - grid.gap * (columns - 1)) / columns : grid.minWidth,
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
  const scroller = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ top: 0, height: 0, width: 0 });
  const cells = grid ? virtualListColumns(grid, view.width) : undefined;
  const columns = cells?.columns ?? 1;
  const cellWidth = cells?.width ?? 0;
  const cellHeight = grid ? grid.height(cellWidth) : 0;
  const gap = grid?.gap ?? 0;
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

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const width = element.firstElementChild?.clientWidth ?? 0;
      setView((prev) =>
        prev.top === element.scrollTop &&
        prev.height === element.clientHeight &&
        prev.width === width
          ? prev
          : {
              top: element.scrollTop,
              height: element.clientHeight,
              width,
            },
      );
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

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
      class={cn(virtualListVariants(), className)}
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
