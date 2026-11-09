import { cva } from "class-variance-authority";
import type { ComponentChildren, JSX, Ref } from "preact";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { cn } from "../../utils/cn";

export const virtualListVariants = cva(
  "relative min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:thin]",
);

export const VIRTUAL_LIST_ROW_HEIGHT = {
  default: 63,
  compact: 44,
} as const;

export const virtualListSlotVariants = cva("absolute inset-x-0", {
  variants: {
    size: {
      default: "pb-[3px]",
      compact: "",
    },
  },
  defaultVariants: { size: "default" },
});

export type VirtualListSize = keyof typeof VIRTUAL_LIST_ROW_HEIGHT;

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
  label,
  class: className,
  listRef,
  ...rest
}: VirtualListProps<T>) {
  const rowHeight = VIRTUAL_LIST_ROW_HEIGHT[size];
  const offsets = useMemo(() => {
    const tops = new Array<number>(items.length + 1);
    tops[0] = 0;
    for (let index = 0; index < items.length; index += 1) {
      tops[index + 1] =
        tops[index]! + (itemHeight ? itemHeight(items[index]!, index) : rowHeight);
    }
    return tops;
  }, [items, itemHeight, rowHeight]);
  const topOf = (index: number) => offsets[index]!;
  const indexAt = (offset: number) => {
    let low = 0;
    let high = items.length;
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
  const scroller = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ top: 0, height: 0 });

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const measure = () =>
      setView((prev) =>
        prev.top === element.scrollTop && prev.height === element.clientHeight
          ? prev
          : { top: element.scrollTop, height: element.clientHeight },
      );
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
    const top = topOf(revealIndex);
    const bottom = topOf(revealIndex + 1);
    if (top < element.scrollTop) {
      element.scrollTop = top;
    } else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
  }, [revealIndex, revealRequest, rowHeight, hasViewport]);

  const first = indexAt(view.top);
  const last = view.height
    ? indexAt(view.top + view.height - 1)
    : first + FIRST_PAINT_ROWS - 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(items.length, start + last - first + 1 + overscan * 2);

  const setRef = (element: HTMLDivElement | null) => {
    scroller.current = element;
    if (typeof listRef === "function") {
      listRef(element);
    } else if (listRef) {
      listRef.current = element;
    }
  };

  const rows: ComponentChildren[] = [];
  for (let index = start; index < end; index += 1) {
    const item = items[index]!;
    rows.push(
      <div
        key={getKey(item, index)}
        role="listitem"
        aria-setsize={items.length}
        aria-posinset={index + 1}
        class={virtualListSlotVariants({ size })}
        style={{ top: topOf(index), height: topOf(index + 1) - topOf(index) }}
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
        style={{ height: topOf(items.length) }}
      >
        {rows}
      </div>
    </div>
  );
}
