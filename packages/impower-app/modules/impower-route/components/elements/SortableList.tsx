import {
  closestCenter,
  DndContext,
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import useMediaQuery from "@mui/material/useMediaQuery";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Portal from "../layouts/Portal";

const easeOutCubic = (t): number => {
  t -= 1;
  return t * t * t + 1;
};

/**
 * @param {number} x pixels to scroll to
 * @param {number} duration time of animation in milliseconds
 */
const smoothScrollX = (el: HTMLElement, x: number, duration = 300): void => {
  const start = el.scrollLeft;
  const difference = x - start;
  const startTime = performance.now();

  const step = (): void => {
    const progress = (performance.now() - startTime) / duration;
    const amount = easeOutCubic(progress);
    el.scrollLeft = start + amount * difference;
    if (progress < 0.99) {
      window.requestAnimationFrame(step);
    }
  };

  step();
};

const StyledSortableList = styled.div`
  display: flex;
  justify-content: center;
`;

const StyledSortableArea = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const StyledOverlay = styled.div``;

const StyledScrollLeftButton = styled(Button)``;

const StyledScrollRightButton = styled(Button)``;

interface SortableItemProps {
  nodeRef?: React.Ref<HTMLDivElement>;
  id: string;
  horizontal: boolean;
}

export const SortableItem = (
  props: PropsWithChildren<SortableItemProps>
): JSX.Element => {
  const { nodeRef, id, children } = props;
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style: React.CSSProperties = useMemo(
    () => ({
      transform: CSS.Translate.toString(transform),
      transition,
      touchAction: "none",
      userSelect: "none",
      willChange: "transform",
    }),
    [transform, transition]
  );

  const handleRef = useCallback(
    (instance: HTMLDivElement) => {
      if (instance) {
        if (nodeRef) {
          if (typeof nodeRef === "function") {
            nodeRef(instance);
          } else {
            (nodeRef as { current: HTMLDivElement }).current = instance;
          }
        }
        setNodeRef(instance);
      }
    },
    [nodeRef, setNodeRef]
  );

  return (
    <div ref={handleRef} {...attributes} {...listeners} style={style}>
      {children}
    </div>
  );
};

const createRefMap = (
  items: string[]
): { [id: string]: { current: HTMLDivElement } } => {
  const refs = {};
  items.forEach((id) => {
    refs[id] = { current: null };
  });
  return refs;
};

interface SortableListProps {
  items: string[];
  style?: React.CSSProperties;
  scrollLeftIcon?: React.ReactNode;
  scrollRightIcon?: React.ReactNode;
  scrollThreshold?: number;
  scrollSpeed?: number;
  direction?: "horizontal" | "vertical" | "responsive";
  onReorder?: (event: DragEndEvent, order: string[]) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
  onClick?: (id: string) => void;
  children?: (props: SortableItemProps) => React.ReactNode;
}

const SortableList = React.memo((props: SortableListProps): JSX.Element => {
  const {
    items,
    scrollLeftIcon,
    scrollRightIcon,
    scrollThreshold = 12,
    scrollSpeed = 4,
    direction = "vertical",
    style,
    children,
    onReorder,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
    onClick,
  } = props;

  const [active, setActive] = useState<string>();
  const draggingRef = useRef<string>("");
  const overlayRef = useRef<HTMLDivElement>();

  const theme = useTheme();
  const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));
  const [scrollEl, setScrollEl] = useState<HTMLDivElement>();
  const holdingLeftRef = useRef(false);
  const holdingRightRef = useRef(false);
  const holdScrollingRef = useRef(false);
  const draggedRef = useRef(true);
  const movingRef = useRef(false);
  const elRefs = React.useRef(createRefMap(items));

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const horizontal =
    direction === "horizontal" ||
    (direction === "responsive" && !belowSmBreakpoint);

  const responsiveStyle: React.CSSProperties = useMemo(
    () => ({
      flexDirection: horizontal ? "row" : "column",
      overflowY: horizontal ? undefined : "auto",
      overflowX: horizontal ? "auto" : undefined,
      justifyContent: horizontal ? "flex-start" : undefined,
      ...style,
    }),
    [horizontal, style]
  );

  const responsiveModifiers = useMemo(
    () =>
      horizontal
        ? [restrictToHorizontalAxis, restrictToParentElement]
        : [restrictToVerticalAxis, restrictToParentElement],
    [horizontal]
  );

  const responsiveSortingStrategy = useMemo(
    () =>
      horizontal ? horizontalListSortingStrategy : verticalListSortingStrategy,
    [horizontal]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      draggedRef.current = false;
      movingRef.current = false;
      setActive(event.active.id as string);
      if (overlayRef.current) {
        overlayRef.current.style.opacity = "1";
        if (overlayRef.current.parentElement) {
          overlayRef.current.parentElement.style.pointerEvents = "auto";
        }
      }
      if (onDragStart) {
        onDragStart(event);
      }
    },
    [onDragStart]
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (Math.abs(event.delta.x) > 10 || Math.abs(event.delta.y) > 10) {
        draggedRef.current = true;
      }
      draggingRef.current = event.active.id as string;
      if (!movingRef.current) {
        movingRef.current = true;
        const activeRef = elRefs.current[draggingRef.current];
        if (activeRef?.current) {
          activeRef.current.style.opacity = "0";
        }
      }
      if (onDragMove) {
        onDragMove(event);
      }
    },
    [onDragMove]
  );

  const handleDragCancel = useCallback(
    (event: DragEndEvent) => {
      movingRef.current = false;
      const activeRef = elRefs.current[draggingRef.current];
      if (activeRef?.current) {
        activeRef.current.style.opacity = "1";
      }
      if (onDragCancel) {
        onDragCancel(event);
      }
    },
    [onDragCancel]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      movingRef.current = false;

      if (!draggedRef.current) {
        if (onClick) {
          onClick(active.id as string);
        }
      }

      if (active.id !== over.id) {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        if (onReorder) {
          onReorder(event, arrayMove(items, oldIndex, newIndex));
        }
      }
      setActive(null);
      const activeRef = elRefs.current[draggingRef.current];
      if (activeRef?.current) {
        activeRef.current.style.opacity = "1";
      }
      if (onDragEnd) {
        onDragEnd(event);
      }
    },
    [items, onClick, onDragEnd, onReorder]
  );

  const handleScrollRef = useCallback((instance: HTMLDivElement) => {
    if (instance && instance.scrollWidth > instance.clientWidth) {
      setScrollEl(instance);
    }
  }, []);

  const scrollLeft = useCallback(() => {
    if (!holdingLeftRef.current || !scrollEl) {
      return;
    }
    holdScrollingRef.current = true;
    scrollEl.scrollLeft = Math.max(0, scrollEl.scrollLeft - scrollSpeed);
    window.requestAnimationFrame(scrollLeft);
  }, [scrollEl, scrollSpeed]);

  const handleLeftScrollPointerDown = useCallback(() => {
    holdScrollingRef.current = false;
    holdingRightRef.current = false;
    holdingLeftRef.current = true;
    window.setTimeout(scrollLeft, 500);
  }, [scrollLeft]);

  const handleLeftScrollPointerUp = useCallback(() => {
    holdingLeftRef.current = false;
    holdScrollingRef.current = false;
    holdingRightRef.current = false;
  }, []);

  const handleLeftScrollClick = useCallback(() => {
    if (holdScrollingRef.current) {
      return;
    }
    const container = scrollEl;
    if (!container) {
      return;
    }
    const children = Array.from(container.children);
    const reversedChildren = children.reverse();
    let firstOffscreenLeftChild;
    let offset = 0;
    for (let i = 0; i < reversedChildren.length; i += 1) {
      const child = reversedChildren[i] as HTMLDivElement;
      const childOffset = child.offsetLeft - container.offsetLeft;
      const scrollOffset = childOffset - container.scrollLeft;
      const amountOffscreen = container.scrollLeft - childOffset;
      const isFirst = i === reversedChildren.length - 1;

      if (!isFirst && amountOffscreen > scrollThreshold && scrollOffset < 0) {
        firstOffscreenLeftChild = child;
        offset = childOffset;
        break;
      }
    }
    if (!firstOffscreenLeftChild) {
      smoothScrollX(container, 0);
    } else if (firstOffscreenLeftChild) {
      smoothScrollX(container, offset);
    }
  }, [scrollEl, scrollThreshold]);

  const scrollRight = useCallback(() => {
    if (!holdingRightRef.current || !scrollEl) {
      return;
    }
    holdScrollingRef.current = true;
    scrollEl.scrollLeft = Math.min(
      scrollEl.scrollWidth - scrollEl.clientWidth,
      scrollEl.scrollLeft + scrollSpeed
    );
    window.requestAnimationFrame(scrollRight);
  }, [scrollEl, scrollSpeed]);

  const handleRightScrollPointerDown = useCallback(() => {
    holdScrollingRef.current = false;
    holdingLeftRef.current = false;
    holdingRightRef.current = true;
    window.setTimeout(scrollRight, 500);
  }, [scrollRight]);

  const handleRightScrollPointerUp = useCallback(() => {
    holdScrollingRef.current = false;
    holdingLeftRef.current = false;
    holdingRightRef.current = false;
  }, []);

  const handleRightScrollClick = useCallback(() => {
    if (holdScrollingRef.current) {
      return;
    }
    const container = scrollEl;
    if (!container) {
      return;
    }
    const children = Array.from(container.children);
    let firstOffscreenRightChild;
    let offset = 0;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i] as HTMLDivElement;
      const childOffset = child.offsetLeft - container.offsetLeft;
      const scrollOffset = childOffset - container.scrollLeft;
      const childEnd = scrollOffset + child.clientWidth;
      const amountOffscreen = childEnd - container.clientWidth;
      const isLast = i === children.length - 1;
      if (
        !isLast &&
        amountOffscreen > scrollThreshold &&
        childEnd > container.clientWidth
      ) {
        firstOffscreenRightChild = child;
        offset = childOffset + child.clientWidth - container.clientWidth;
        break;
      }
    }
    if (!firstOffscreenRightChild) {
      smoothScrollX(container, container.scrollWidth - container.clientWidth);
    } else if (firstOffscreenRightChild) {
      smoothScrollX(container, offset);
    }
  }, [scrollEl, scrollThreshold]);

  useEffect(() => {
    const handlePointerUp = (): void => {
      movingRef.current = false;
      Object.values(elRefs.current).forEach((ref) => {
        ref.current.style.opacity = "1";
      });
      window.requestAnimationFrame(() => {
        if (overlayRef.current) {
          overlayRef.current.style.opacity = "0";
          if (overlayRef.current.parentElement) {
            overlayRef.current.parentElement.style.pointerEvents = "none";
          }
        }
      });
    };
    window.addEventListener("pointerup", handlePointerUp);
    return (): void => {
      window.removeEventListener("pointerup", handlePointerUp);
    };
  });

  return (
    <StyledSortableList>
      {horizontal && scrollLeftIcon && scrollEl && (
        <StyledScrollLeftButton
          onPointerDown={handleLeftScrollPointerDown}
          onPointerUp={handleLeftScrollPointerUp}
          onClick={handleLeftScrollClick}
        >
          {scrollLeftIcon}
        </StyledScrollLeftButton>
      )}
      <DndContext
        sensors={sensors}
        modifiers={responsiveModifiers}
        autoScroll={horizontal}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={onDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <StyledSortableArea ref={handleScrollRef} style={responsiveStyle}>
          <SortableContext items={items} strategy={responsiveSortingStrategy}>
            {items.map((id) => (
              <SortableItem
                key={id}
                id={id}
                nodeRef={elRefs.current[id]}
                horizontal={horizontal}
              >
                {children({
                  id,
                  horizontal,
                })}
              </SortableItem>
            ))}
          </SortableContext>
        </StyledSortableArea>
        <Portal>
          <DragOverlay dropAnimation={null} zIndex={10000}>
            <StyledOverlay ref={overlayRef}>
              {children({
                id: active,
                horizontal,
              })}
            </StyledOverlay>
          </DragOverlay>
        </Portal>
      </DndContext>
      {horizontal && scrollRightIcon && scrollEl && (
        <StyledScrollRightButton
          onPointerDown={handleRightScrollPointerDown}
          onPointerUp={handleRightScrollPointerUp}
          onClick={handleRightScrollClick}
        >
          {scrollRightIcon}
        </StyledScrollRightButton>
      )}
    </StyledSortableList>
  );
});

export default SortableList;
