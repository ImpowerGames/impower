import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  motion,
  AnimationControls,
  TargetAndTransition,
  VariantLabels,
  useMotionValue,
  useDragControls,
  MotionValue,
} from "framer-motion";
import Measure, { ContentRect } from "react-measure";
import {
  OnDragNode,
  OnNodeSizeChanged,
  OnNodeSizeDetermined,
  DraggableEvent,
  OnTapNode,
} from "../types/functions";
import { Vector2 } from "../types/generics";
import { getClientXY } from "../utils/event";
import { getEncompassingRect, getRects, getRect } from "../utils/rect";
import { getBounds } from "../utils/bounds";
import { getSnappedVector } from "../utils/snap";

export const getBoundsOffset = (
  id: string,
  ghostingIds: string[],
  currentPositions: { [id: string]: Vector2 },
  currentSizes: { [id: string]: Vector2 }
): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} => {
  if (ghostingIds.length > 1 && id in currentPositions && id in currentSizes) {
    // If we are multi-dragging, include selected nodes in bounds calculation
    const encompassingRect = getEncompassingRect(
      getRects(ghostingIds, currentPositions, currentSizes)
    );
    const nodeRect = getRect(currentPositions[id], currentSizes[id]);

    return {
      left: nodeRect.min.x - (encompassingRect?.min.x || 0),
      top: nodeRect.min.y - (encompassingRect?.min.y || 0),
      right: nodeRect.max.x - (encompassingRect?.max.x || 0),
      bottom: nodeRect.max.y - (encompassingRect?.max.y || 0),
    };
  }
  return {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  };
};

export interface FlowchartNodeProvided {
  scale: number;
  scrollParent: HTMLElement | null;
  scrollThreshold: number;
  scrollSpeed: number;
  snapToGridSize: number;
  draggingX: MotionValue<number>;
  draggingY: MotionValue<number>;
  draggingOriginX: MotionValue<number>;
  draggingOriginY: MotionValue<number>;
  boundsSelector: string;
  ghostingIds: string[];
  nodePositions: { [id: string]: Vector2 };
  nodeOffsets: { [id: string]: Vector2 };
  nodeSizes: { [id: string]: Vector2 };
  pressDelay?: number;
  onDragHandleTrigger?: (event: DraggableEvent) => void;
  onPointerDownNode: OnTapNode;
  onPointerUpNode: OnTapNode;
  onTapNodeStart: OnTapNode;
  onTapNode: OnTapNode;
  onTapNodeCancel: OnTapNode;
  onDragNodeForced: OnDragNode;
  onDragNodeStart: OnDragNode;
  onDragNode: OnDragNode;
  onDragNodeEnd: OnDragNode;
  onDragNodeTransitionEnd: OnDragNode;
  onNodeSizeDetermined: OnNodeSizeDetermined;
  onNodeSizeChanged: OnNodeSizeChanged;
  onNodeRef?: (id: string, instance: HTMLDivElement | null) => void;
  children?: (provided: {
    onDragHandleTrigger: (event: DraggableEvent) => void;
  }) => JSX.Element | null;
}

interface FlowchartNodeProps extends FlowchartNodeProvided {
  id: string;
  defaultPosition: Vector2;
  forcedPosition?: { value: Vector2 };
  drag?: boolean | "x" | "y";
  handle?: string;
  whileHover?: string | TargetAndTransition;
  whileTap?: string | TargetAndTransition;
  dragElastic?: boolean | number;
  dragAnimation?: AnimationControls | TargetAndTransition | VariantLabels;
  idleAnimation?: AnimationControls | TargetAndTransition | VariantLabels;
  pressDelay?: number;
}

export const FlowchartNode = (props: FlowchartNodeProps): JSX.Element => {
  const {
    scale,
    scrollParent,
    scrollThreshold,
    scrollSpeed,
    snapToGridSize,
    draggingX,
    draggingY,
    draggingOriginX,
    draggingOriginY,
    boundsSelector,
    ghostingIds,
    nodePositions,
    nodeOffsets,
    nodeSizes,
    id,
    defaultPosition,
    forcedPosition,
    whileHover,
    whileTap,
    dragElastic = 0,
    // If we're dragging, we want to set the zIndex of that item to be on top of the other items.
    dragAnimation = { zIndex: 10000 },
    idleAnimation = { zIndex: 0, transition: { delay: 0.3 } },
    drag = true,
    pressDelay,
    onDragHandleTrigger,
    onPointerUpNode,
    onPointerDownNode,
    onTapNodeStart,
    onTapNode,
    onTapNodeCancel,
    onDragNodeForced,
    onDragNodeStart,
    onDragNode,
    onDragNodeEnd,
    onDragNodeTransitionEnd,
    onNodeSizeDetermined,
    onNodeSizeChanged,
    onNodeRef = (): void => null,
    children,
  } = props;

  const [dragging, setDragging] = useState(false);
  const scrollXMax = useRef<number>(0);
  const scrollYMax = useRef<number>(0);
  const prevScrollLeft = useRef<number>(0);
  const prevScrollTop = useRef<number>(0);
  const draggingTimeoutHandle = useRef(-1);
  const initiatedDrag = useRef(false);

  // We'll use a `ref` to access the DOM element that the `motion.li` produces.
  // This will allow us to measure its height and position, which will be useful to
  // decide when a dragging element should switch places with its siblings.
  const ref = useRef<{ element: HTMLDivElement | null }>({ element: null });

  // By manually creating a reference to `dragOriginX` and `dragOriginY` we can manipulate this value
  // if the user is dragging this DOM element while the drag gesture is active to
  // compensate for any movement as the items are re-positioned.
  const originX = useMotionValue(0);
  const originY = useMotionValue(0);
  const x = useMotionValue(defaultPosition.x);
  const y = useMotionValue(defaultPosition.y);
  const dragControls = useDragControls();

  const handlePanStart = useCallback((): void => {
    if (draggingTimeoutHandle.current >= 0) {
      clearTimeout(draggingTimeoutHandle.current);
    }
  }, []);

  const handleTapStart = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent): void => {
      const newPosition = { x: x.get(), y: y.get() };
      onTapNodeStart({
        id,
        position: newPosition,
        event,
      });
    },
    [onTapNodeStart, x, y, id]
  );

  const handleTap = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent): void => {
      const newPosition = { x: x.get(), y: y.get() };
      onTapNode({
        id,
        position: newPosition,
        event,
      });
      if (draggingTimeoutHandle.current >= 0) {
        clearTimeout(draggingTimeoutHandle.current);
      }
    },
    [onTapNode, x, y, id]
  );

  const handleTapCancel = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent): void => {
      const newPosition = { x: x.get(), y: y.get() };
      onTapNodeCancel({
        id,
        position: newPosition,
        event,
      });
      if (draggingTimeoutHandle.current >= 0) {
        clearTimeout(draggingTimeoutHandle.current);
      }
    },
    [onTapNodeCancel, x, y, id]
  );

  const handleDragStart = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent): void => {
      setDragging(true);
      if (scrollParent) {
        scrollXMax.current =
          scrollParent.scrollWidth - scrollParent.offsetWidth;
        scrollYMax.current =
          scrollParent.scrollHeight - scrollParent.offsetHeight;
        prevScrollLeft.current = scrollParent.scrollLeft;
        prevScrollTop.current = scrollParent.scrollTop;
      }
      const newPosition = { x: x.get(), y: y.get() };
      onDragNodeStart({
        id,
        position: newPosition,
        event,
      });
    },
    [x, y, scrollParent, onDragNodeStart, id]
  );

  const handleDragMoveStart = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent): void => {
      if (!pressDelay) {
        handleDragStart(event);
      }
    },
    [pressDelay, handleDragStart]
  );

  const handleDrag = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent): void => {
      const newPosition = { x: x.get(), y: y.get() };
      // Scroll the list when dragging near the list boundaries
      if (scrollParent) {
        const { clientX, clientY } = getClientXY(event);
        const scrollRect = scrollParent.getBoundingClientRect();
        const minX = scrollRect.x;
        const maxX = scrollRect.x + scrollRect.width;
        const startXOffset = clientX - minX;
        const endXOffset = maxX - clientX;
        if (startXOffset < scrollThreshold && scrollParent.scrollLeft > 0) {
          const scrollDistance = scrollThreshold - startXOffset;
          const scrollAmount = -Math.ceil(scrollSpeed * scrollDistance);
          scrollParent.scrollLeft = prevScrollLeft.current + scrollAmount;
          prevScrollLeft.current = scrollParent.scrollLeft;
          draggingOriginX.set(draggingOriginX.get() + scrollAmount / scale);
        }
        if (
          endXOffset < scrollThreshold &&
          scrollParent.scrollLeft < scrollXMax.current
        ) {
          const scrollDistance = scrollThreshold - endXOffset;
          const scrollAmount = Math.ceil(scrollSpeed * scrollDistance);
          scrollParent.scrollLeft = prevScrollLeft.current + scrollAmount;
          prevScrollLeft.current = scrollParent.scrollLeft;
          draggingOriginX.set(draggingOriginX.get() + scrollAmount / scale);
        }
        const minY = scrollRect.y;
        const maxY = scrollRect.y + scrollRect.height;
        const startYOffset = clientY - minY;
        const endYOffset = maxY - clientY;
        if (startYOffset < scrollThreshold && scrollParent.scrollTop > 0) {
          const scrollDistance = scrollThreshold - startYOffset;
          const scrollAmount = -Math.ceil(scrollSpeed * scrollDistance);
          scrollParent.scrollTop = prevScrollTop.current + scrollAmount;
          prevScrollTop.current = scrollParent.scrollTop;
          draggingOriginY.set(draggingOriginY.get() + scrollAmount / scale);
        }
        if (
          endYOffset < scrollThreshold &&
          scrollParent.scrollTop < scrollYMax.current
        ) {
          const scrollDistance = scrollThreshold - endYOffset;
          const scrollAmount = Math.ceil(scrollSpeed * scrollDistance);
          scrollParent.scrollTop = prevScrollTop.current + scrollAmount;
          prevScrollTop.current = scrollParent.scrollTop;
          draggingOriginY.set(draggingOriginY.get() + scrollAmount / scale);
        }
      }

      onDragNode({
        id,
        position: newPosition,
        event,
      });
    },
    [
      onDragNode,
      scrollParent,
      scrollXMax,
      scrollYMax,
      prevScrollLeft,
      prevScrollTop,
      x,
      y,
      id,
      draggingOriginX,
      draggingOriginY,
      scale,
      scrollSpeed,
      scrollThreshold,
    ]
  );

  const handleDragEnd = useCallback(
    (event: PointerEvent): void => {
      initiatedDrag.current = false;
      const newPosition = { x: x.get(), y: y.get() };
      setDragging(false);
      onDragNodeEnd({
        id,
        position: newPosition,
        event,
      });
    },
    [onDragNodeEnd, x, y, id]
  );

  const handleDragTransitionEnd = useCallback((): void => {
    initiatedDrag.current = false;
    const newPosition = getSnappedVector(
      { x: x.get(), y: y.get() },
      snapToGridSize
    );
    // Snap this node
    x.set(newPosition.x);
    y.set(newPosition.y);
    // Snap other nodes that are subscribed to this node
    draggingX.set(newPosition.x);
    draggingY.set(newPosition.y);

    onDragNodeTransitionEnd({
      id,
      position: newPosition,
    });
  }, [onDragNodeTransitionEnd, x, y, snapToGridSize, id, draggingX, draggingY]);

  const handleDragHandleTrigger = useCallback(
    (event): void => {
      draggingTimeoutHandle.current = window.setTimeout(() => {
        dragControls.start(event, {
          snapToCursor: false,
        });
        if (onDragHandleTrigger) {
          onDragHandleTrigger(event);
        }
        initiatedDrag.current = true;
        if (pressDelay) {
          handleDragStart(event);
        }
      }, pressDelay || 0);
    },
    [dragControls, handleDragStart, onDragHandleTrigger, pressDelay]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent): void => {
      const newPosition = { x: x.get(), y: y.get() };
      onPointerDownNode({
        id,
        position: newPosition,
        event,
      });
    },
    [onPointerDownNode, x, y, id]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent): void => {
      const newPosition = { x: x.get(), y: y.get() };
      onPointerUpNode({
        id,
        position: newPosition,
        event,
      });
      if (draggingTimeoutHandle.current >= 0) {
        clearTimeout(draggingTimeoutHandle.current);
      }
      if (initiatedDrag.current) {
        handleDragEnd(event as unknown as PointerEvent);
        handleDragTransitionEnd();
      }
    },
    [x, y, onPointerUpNode, id, handleDragEnd, handleDragTransitionEnd]
  );

  const handleNodeRef = useCallback(
    (element: HTMLDivElement) => {
      if (element) {
        ref.current.element = element;
        onNodeRef(id, element);
        onNodeSizeDetermined({
          id,
          size: {
            x: element.offsetWidth,
            y: element.offsetHeight,
          },
        });
      }
    },
    [onNodeRef, onNodeSizeDetermined, id]
  );

  const handleNodeSizeChanged = useCallback(
    (contentRect: ContentRect) => {
      if (contentRect.bounds) {
        onNodeSizeChanged({
          id,
          size: {
            x: contentRect.bounds.width,
            y: contentRect.bounds.height,
          },
        });
      }
    },
    [onNodeSizeChanged, id]
  );

  useEffect(() => {
    const updateX = (value: number): void => {
      if (dragging) {
        x.set(value);
      } else if (ghostingIds.includes(id)) {
        const nodeOffset = nodeOffsets[id];
        x.set(value + (nodeOffset ? nodeOffset.x : 0));
      }
    };
    const updateY = (value: number): void => {
      if (dragging) {
        y.set(value);
      } else if (ghostingIds.includes(id)) {
        const nodeOffset = nodeOffsets[id];
        y.set(value + (nodeOffset ? nodeOffset.y : 0));
      }
    };
    const updateOriginX = (value: number): void => {
      if (dragging) {
        originX.set(value);
      } else if (ghostingIds.includes(id)) {
        const nodeOffset = nodeOffsets[id];
        originX.set(value + (nodeOffset ? nodeOffset.x : 0));
      }
    };
    const updateOriginY = (value: number): void => {
      if (dragging) {
        originY.set(value);
      } else if (ghostingIds.includes(id)) {
        const nodeOffset = nodeOffsets[id];
        originY.set(value + (nodeOffset ? nodeOffset.y : 0));
      }
    };
    if (dragging || ghostingIds.includes(id)) {
      const unsubscribeX = draggingX.onChange(updateX);
      const unsubscribeY = draggingY.onChange(updateY);
      const unsubscribeOriginX = draggingOriginX.onChange(updateOriginX);
      const unsubscribeOriginY = draggingOriginY.onChange(updateOriginY);

      return (): void => {
        unsubscribeX();
        unsubscribeY();
        unsubscribeOriginX();
        unsubscribeOriginY();
      };
    }
    return undefined;
  }, [
    dragging,
    ghostingIds,
    draggingOriginX,
    draggingOriginY,
    draggingX,
    draggingY,
    id,
    nodeOffsets,
    originX,
    originY,
    x,
    y,
  ]);

  useEffect(() => {
    if (dragging) {
      draggingX.set(defaultPosition.x);
      draggingY.set(defaultPosition.y);
      draggingOriginX.set(defaultPosition.x);
      draggingOriginY.set(defaultPosition.y);
    }
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    x.set(defaultPosition.x);
    y.set(defaultPosition.y);
    originX.set(defaultPosition.x);
    originY.set(defaultPosition.y);
  }, [defaultPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (forcedPosition) {
      const newPosition = { ...forcedPosition.value };
      // Force this node
      x.set(newPosition.x);
      y.set(newPosition.y);
      // Force other nodes that are subscribed to this node
      draggingX.set(newPosition.x);
      draggingY.set(newPosition.y);
      onDragNodeForced({ id, position: newPosition });
    }
  }, [forcedPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  const dragConstraints = getBounds(
    ref.current.element,
    boundsSelector,
    getBoundsOffset(id, ghostingIds, nodePositions, nodeSizes)
  );

  // TODO: Fix to use @dnd-kit instead of framer-motion
  return (
    <motion.div
      ref={handleNodeRef}
      initial={false}
      animate={
        dragging || ghostingIds.includes(id) ? dragAnimation : idleAnimation
      }
      style={{
        position: "absolute",
        x: dragging ? draggingX : x,
        y: dragging ? draggingY : y,
      }}
      whileHover={whileHover}
      whileTap={whileTap}
      drag={drag}
      dragConstraints={dragConstraints}
      dragElastic={dragElastic}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onTapStart={handleTapStart}
      onTap={handleTap}
      onTapCancel={handleTapCancel}
      onDragStart={handleDragMoveStart}
      onDragEnd={handleDragEnd}
      onDrag={handleDrag}
      onDragTransitionEnd={handleDragTransitionEnd}
      dragControls={dragControls}
      dragListener={false}
      dragTransition={{ power: 0 }}
      onPanStart={handlePanStart}
    >
      <Measure bounds onResize={handleNodeSizeChanged}>
        {({ measureRef }): JSX.Element => (
          <div ref={measureRef}>
            {children &&
              children({ onDragHandleTrigger: handleDragHandleTrigger })}
          </div>
        )}
      </Measure>
    </motion.div>
  );
};
