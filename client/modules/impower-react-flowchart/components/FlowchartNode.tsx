import React, {
  TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Measure, { ContentRect } from "react-measure";
import {
  OnDragNode,
  OnNodeSizeChanged,
  OnNodeSizeDetermined,
  OnTapNode,
} from "../types/functions";
import { Vector2 } from "../types/generics";
import { getEncompassingRect, getRect, getRects } from "../utils/rect";
import { getSnappedVector } from "../utils/snap";

const setPosition = (element: HTMLElement, newPosition: Vector2): void => {
  if (!element) {
    return;
  }
  if (!newPosition) {
    return;
  }
  element.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`;
};

const getPosition = (element: HTMLElement): Vector2 => {
  if (!element || !element.style.transform) {
    return undefined;
  }
  const [x, y] = element.style.transform
    .replace("translate(", "")
    .replace(")", "")
    .split(",")
    .map((x) => Number(x.trim().replace("px", "")));
  return { x, y };
};

const setZIndex = (element: HTMLElement, zIndex: number): void => {
  element.style.zIndex =
    zIndex === undefined ? undefined : zIndex === null ? null : `${zIndex}`;
};

export const getMultiDragBoundsOffset = (
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
  if (ghostingIds?.length > 1 && id in currentPositions && id in currentSizes) {
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
  scrollParent: HTMLElement;
  scale: number;
  scrollThreshold: number;
  scrollSpeed: number;
  chartSize: Vector2;
  snapToGridSize: number;
  draggingId: string;
  startDraggingPosition: Vector2;
  selectedIds: string[];
  nodeSizes: { [id: string]: Vector2 };
  nodeElements: { [id: string]: HTMLElement };
  onPointerDownNode: OnTapNode;
  onPointerUpNode: OnTapNode;
  onDragNodeForced: OnDragNode;
  onDragNodeCapture: OnDragNode;
  onDragNodeStart: OnDragNode;
  onDragNode: OnDragNode;
  onDragNodeEnd: OnDragNode;
  onNodeSizeDetermined: OnNodeSizeDetermined;
  onNodeSizeChanged: OnNodeSizeChanged;
  onNodeRef?: (id: string, instance: HTMLDivElement) => void;
  children?: React.ReactNode;
}

interface FlowchartNodeProps extends FlowchartNodeProvided {
  id: string;
  defaultPosition: Vector2;
  forcedPosition?: { value: Vector2 };
}

export const FlowchartNode = (props: FlowchartNodeProps): JSX.Element => {
  const {
    scrollParent,
    scale,
    scrollThreshold,
    scrollSpeed,
    chartSize,
    snapToGridSize,
    draggingId,
    startDraggingPosition,
    selectedIds,
    nodeSizes,
    nodeElements,
    id,
    defaultPosition = { x: 0, y: 0 },
    forcedPosition,
    onPointerUpNode,
    onPointerDownNode,
    onDragNodeForced,
    onDragNodeCapture,
    onDragNodeStart,
    onDragNode,
    onDragNodeEnd,
    onNodeSizeDetermined,
    onNodeSizeChanged,
    onNodeRef,
    children,
  } = props;

  const scrollXMaxRef = useRef<number>(0);
  const scrollYMaxRef = useRef<number>(0);
  const pointerDownRef = useRef(false);
  const possibleDragRef = useRef(false);
  const dragStartedRef = useRef(false);
  const draggingRef = useRef(false);
  const positionRef = useRef<Vector2>(defaultPosition);
  const possibleScrollRef = useRef(false);
  const scrollingRef = useRef(false);
  const startScrollOffsetRef = useRef<Vector2>();
  const startScrollNodePositionRef = useRef<Vector2>();
  const startPointerPositionRef = useRef<Vector2>();
  const startNodePositionRef = useRef<Vector2>(positionRef.current);
  const pointerPositionRef = useRef<Vector2>();
  const scrollRectRef = useRef<DOMRect>();
  const ref = useRef<HTMLDivElement>();
  const scrollLoopTimeoutHandle = useRef<number>();
  const positionLoopTimeoutHandle = useRef<number>();
  const ghostLoopTimeoutHandle = useRef<number>();

  const [possibleDrag, setPossibleDrag] = useState(possibleDragRef.current);

  const size = nodeSizes?.[id];

  const updatePosition = useCallback(
    (newPosition: Vector2): Vector2 => {
      if (!newPosition) {
        return newPosition;
      }
      positionRef.current = newPosition;
      const snappedPosition = getSnappedVector(
        newPosition,
        snapToGridSize,
        size,
        chartSize
      );
      setPosition(ref.current, snappedPosition);
      return snappedPosition;
    },
    [chartSize, size, snapToGridSize]
  );

  const scrollLoop = useCallback((): void => {
    scrollLoopTimeoutHandle.current = undefined;

    if (scrollParent && possibleScrollRef.current && pointerDownRef.current) {
      if (!scrollRectRef.current) {
        scrollRectRef.current = scrollParent.getBoundingClientRect();
      }
      const clientX = pointerPositionRef.current.x;
      const clientY = pointerPositionRef.current.y;
      const scrollRect = scrollRectRef.current;
      const minX = scrollRect.x;
      const maxX = scrollRect.x + scrollRect.width;
      const startXOffset = clientX - minX;
      const endXOffset = maxX - clientX;
      let shouldScroll = false;
      if (startXOffset < scrollThreshold && scrollParent.scrollLeft > 0) {
        shouldScroll = true;
        const scrollDistance = scrollThreshold - startXOffset;
        const scrollAmount = -Math.ceil(scrollSpeed * scrollDistance);
        scrollParent.scrollLeft += scrollAmount;
      }
      if (
        endXOffset < scrollThreshold &&
        scrollParent.scrollLeft < scrollXMaxRef.current
      ) {
        shouldScroll = true;
        const scrollDistance = scrollThreshold - endXOffset;
        const scrollAmount = Math.ceil(scrollSpeed * scrollDistance);
        scrollParent.scrollLeft += scrollAmount;
      }
      const minY = scrollRect.y;
      const maxY = scrollRect.y + scrollRect.height;
      const startYOffset = clientY - minY;
      const endYOffset = maxY - clientY;
      if (startYOffset < scrollThreshold && scrollParent.scrollTop > 0) {
        shouldScroll = true;
        const scrollDistance = scrollThreshold - startYOffset;
        const scrollAmount = -Math.ceil(scrollSpeed * scrollDistance);
        scrollParent.scrollTop += scrollAmount;
      }
      if (
        endYOffset < scrollThreshold &&
        scrollParent.scrollTop < scrollYMaxRef.current
      ) {
        shouldScroll = true;
        const scrollDistance = scrollThreshold - endYOffset;
        const scrollAmount = Math.ceil(scrollSpeed * scrollDistance);
        scrollParent.scrollTop += scrollAmount;
      }
      if (shouldScroll) {
        if (!scrollingRef.current) {
          scrollingRef.current = true;
          startScrollOffsetRef.current = {
            x: scrollParent.scrollLeft,
            y: scrollParent.scrollTop,
          };
          startScrollNodePositionRef.current = { ...positionRef.current };
        }
      } else if (scrollingRef.current) {
        scrollingRef.current = false;
        startNodePositionRef.current = { ...positionRef.current };
        startPointerPositionRef.current = { x: clientX, y: clientY };
      }

      if (!scrollLoopTimeoutHandle.current) {
        scrollLoopTimeoutHandle.current =
          window.requestAnimationFrame(scrollLoop);
      }
    }
  }, [scrollParent, scrollSpeed, scrollThreshold]);

  const stopScrollLoop = useCallback((): void => {
    if (scrollLoopTimeoutHandle.current) {
      window.cancelAnimationFrame(scrollLoopTimeoutHandle.current);
      scrollLoopTimeoutHandle.current = undefined;
    }
  }, []);

  const positionLoop = useCallback((): void => {
    positionLoopTimeoutHandle.current = undefined;

    if (
      possibleScrollRef.current &&
      pointerDownRef.current &&
      scrollingRef.current &&
      scrollParent &&
      startScrollOffsetRef.current &&
      startScrollNodePositionRef.current
    ) {
      const scrollDelta = {
        x: scrollParent.scrollLeft - startScrollOffsetRef.current.x,
        y: scrollParent.scrollTop - startScrollOffsetRef.current.y,
      };
      updatePosition({
        x: startScrollNodePositionRef.current.x + scrollDelta.x / scale,
        y: startScrollNodePositionRef.current.y + scrollDelta.y / scale,
      });
    }

    if (!positionLoopTimeoutHandle.current) {
      positionLoopTimeoutHandle.current =
        window.requestAnimationFrame(positionLoop);
    }
  }, [scale, scrollParent, updatePosition]);

  const stopPositionLoop = useCallback((): void => {
    if (positionLoopTimeoutHandle.current) {
      window.cancelAnimationFrame(positionLoopTimeoutHandle.current);
      positionLoopTimeoutHandle.current = undefined;
    }
  }, []);

  const ghostLoop = useCallback((): void => {
    ghostLoopTimeoutHandle.current = undefined;

    if (startDraggingPosition && startNodePositionRef.current) {
      const nodeOffset = {
        x: startDraggingPosition.x - startNodePositionRef.current.x,
        y: startDraggingPosition.y - startNodePositionRef.current.y,
      };
      const draggingElement = nodeElements[draggingId];
      const draggingPosition = getPosition(draggingElement);
      const newOffsetPosition = {
        x: draggingPosition.x - nodeOffset.x,
        y: draggingPosition.y - nodeOffset.y,
      };
      updatePosition(newOffsetPosition);
    }

    if (!ghostLoopTimeoutHandle.current) {
      ghostLoopTimeoutHandle.current = window.requestAnimationFrame(ghostLoop);
    }
  }, [draggingId, nodeElements, startDraggingPosition, updatePosition]);

  const stopGhostLoop = useCallback((): void => {
    if (ghostLoopTimeoutHandle.current) {
      window.cancelAnimationFrame(ghostLoopTimeoutHandle.current);
      ghostLoopTimeoutHandle.current = undefined;
    }
  }, []);

  const updateZIndex = useCallback((newZIndex: number): void => {
    setZIndex(ref.current, newZIndex);
  }, []);

  const handleDragStart = useCallback(
    (event: PointerEvent | React.PointerEvent): void => {
      scrollRectRef.current = scrollParent.getBoundingClientRect();
      updateZIndex(10000);
      if (scrollParent) {
        scrollXMaxRef.current =
          scrollParent.scrollWidth - scrollParent.offsetWidth;
        scrollYMaxRef.current =
          scrollParent.scrollHeight - scrollParent.offsetHeight;
      }
      onDragNodeStart?.({
        id,
        position: getSnappedVector(
          positionRef.current,
          snapToGridSize,
          size,
          chartSize
        ),
        event,
      });
    },
    [
      scrollParent,
      updateZIndex,
      onDragNodeStart,
      id,
      snapToGridSize,
      size,
      chartSize,
    ]
  );

  const handleDrag = useCallback(
    (event: Event): void => {
      if (pointerDownRef.current) {
        possibleScrollRef.current = true;
        if (possibleDragRef.current && startPointerPositionRef.current) {
          const clientX =
            (event as PointerEvent)?.clientX !== undefined
              ? (event as PointerEvent)?.clientX
              : (event as unknown as TouchEvent)?.touches?.[0]?.clientX;
          const clientY =
            (event as PointerEvent)?.clientY !== undefined
              ? (event as PointerEvent)?.clientY
              : (event as unknown as TouchEvent)?.touches?.[0]?.clientY;
          const pointerPositionDelta = {
            x: clientX - startPointerPositionRef.current.x,
            y: clientY - startPointerPositionRef.current.y,
          };
          const newPosition = {
            x: startNodePositionRef.current.x + pointerPositionDelta.x / scale,
            y: startNodePositionRef.current.y + pointerPositionDelta.y / scale,
          };
          pointerPositionRef.current = { x: clientX, y: clientY };
          const pointerEvent = { ...event, clientX, clientY } as PointerEvent;

          const snappedPosition = scrollingRef.current
            ? positionRef.current
            : updatePosition(newPosition);

          // Scroll when dragging near the list boundaries
          if (!scrollLoopTimeoutHandle.current) {
            scrollLoopTimeoutHandle.current =
              window.requestAnimationFrame(scrollLoop);
          }
          // Move node when dragging near the list boundaries
          if (!positionLoopTimeoutHandle.current) {
            positionLoopTimeoutHandle.current =
              window.requestAnimationFrame(positionLoop);
          }

          const positionChanged =
            snappedPosition.x !== startNodePositionRef.current.x ||
            snappedPosition.y !== startNodePositionRef.current.y;

          if (!draggingRef.current) {
            onDragNodeCapture?.({
              id,
              position: getSnappedVector(
                positionRef.current,
                snapToGridSize,
                size,
                chartSize
              ),
              event: pointerEvent,
            });
            if (positionChanged) {
              draggingRef.current = true;
              handleDragStart(pointerEvent);
            }
          }

          if (draggingRef.current) {
            onDragNode?.({
              id,
              position: getSnappedVector(
                positionRef.current,
                snapToGridSize,
                size,
                chartSize
              ),
              event: pointerEvent,
            });
          }
        } else if (
          draggingId &&
          draggingId !== id &&
          startDraggingPosition &&
          selectedIds?.includes(id)
        ) {
          // Move node when dragging other node
          if (!ghostLoopTimeoutHandle.current) {
            ghostLoopTimeoutHandle.current =
              window.requestAnimationFrame(ghostLoop);
          }
        }
      }
    },
    [
      draggingId,
      id,
      startDraggingPosition,
      selectedIds,
      scale,
      updatePosition,
      scrollLoop,
      positionLoop,
      onDragNodeCapture,
      snapToGridSize,
      size,
      chartSize,
      handleDragStart,
      onDragNode,
      ghostLoop,
    ]
  );

  const handlePointerDownNode = useCallback(
    (event: PointerEvent | React.PointerEvent): void => {
      event.preventDefault();
      pointerDownRef.current = true;
      possibleDragRef.current = true;
      setPossibleDrag(possibleDragRef.current);
      startPointerPositionRef.current = { x: event.clientX, y: event.clientY };
      startNodePositionRef.current = {
        x: positionRef.current.x,
        y: positionRef.current.y,
      };
      onPointerDownNode?.({
        id,
        position: getSnappedVector(
          positionRef.current,
          snapToGridSize,
          size,
          chartSize
        ),
        event,
      });
    },
    [onPointerDownNode, id, snapToGridSize, size, chartSize]
  );

  const handlePointerUpNode = useCallback(
    (event: PointerEvent | React.PointerEvent): void => {
      if (!draggingRef.current) {
        onPointerUpNode?.({
          id,
          position: getSnappedVector(
            positionRef.current,
            snapToGridSize,
            size,
            chartSize
          ),
          event,
        });
      }
      updateZIndex(null);
      possibleDragRef.current = false;
      setPossibleDrag(possibleDragRef.current);
      dragStartedRef.current = false;
      draggingRef.current = false;
    },
    [updateZIndex, onPointerUpNode, id, snapToGridSize, size, chartSize]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent | React.PointerEvent): void => {
      pointerDownRef.current = true;
      startPointerPositionRef.current = { x: event.clientX, y: event.clientY };
      startNodePositionRef.current = {
        x: positionRef.current.x,
        y: positionRef.current.y,
      };
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: Event): void => {
      handleDrag(event);
    },
    [handleDrag]
  );

  const handlePointerUp = useCallback(
    (event: Event): void => {
      possibleScrollRef.current = false;
      startScrollOffsetRef.current = undefined;
      startScrollNodePositionRef.current = undefined;
      const clientX =
        (event as PointerEvent)?.clientX !== undefined
          ? (event as PointerEvent)?.clientX
          : (event as unknown as TouchEvent)?.touches?.[0]?.clientX;
      const clientY =
        (event as PointerEvent)?.clientY !== undefined
          ? (event as PointerEvent)?.clientY
          : (event as unknown as TouchEvent)?.touches?.[0]?.clientY;
      const pointerEvent = { ...event, clientX, clientY } as PointerEvent;
      if (draggingRef.current || selectedIds?.includes(id)) {
        onDragNodeEnd?.({
          id,
          position: getSnappedVector(
            positionRef.current,
            snapToGridSize,
            size,
            chartSize
          ),
          event: pointerEvent,
        });
      }
      pointerDownRef.current = false;
      updateZIndex(null);
      possibleDragRef.current = false;
      setPossibleDrag(possibleDragRef.current);
      draggingRef.current = false;
      dragStartedRef.current = false;
      scrollingRef.current = false;
      stopScrollLoop();
      stopPositionLoop();
      stopGhostLoop();
    },
    [
      chartSize,
      id,
      onDragNodeEnd,
      selectedIds,
      size,
      snapToGridSize,
      stopGhostLoop,
      stopPositionLoop,
      stopScrollLoop,
      updateZIndex,
    ]
  );

  const handleNodeRef = useCallback(
    (element: HTMLDivElement) => {
      if (element) {
        ref.current = element;
        onNodeRef?.(id, element);
        onNodeSizeDetermined?.({
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
        onNodeSizeChanged?.({
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
    if (scrollParent) {
      scrollRectRef.current = scrollParent.getBoundingClientRect();
    }
  }, [scrollParent]);

  useEffect(() => {
    if (!defaultPosition) {
      return;
    }
    updatePosition(defaultPosition);
  }, [defaultPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!forcedPosition) {
      return;
    }
    const newPosition = { ...forcedPosition.value };
    updatePosition(newPosition);
    onDragNodeForced?.({
      id,
      position: getSnappedVector(
        positionRef.current,
        snapToGridSize,
        size,
        chartSize
      ),
    });
  }, [forcedPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.addEventListener("pointerdown", handlePointerDown);
    return (): void => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [possibleDrag, handlePointerDown, selectedIds, id]);

  useEffect(() => {
    if (possibleDrag || selectedIds?.includes(id)) {
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("touchmove", handlePointerMove);
    } else {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("touchmove", handlePointerMove);
    }
    return (): void => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("touchmove", handlePointerMove);
    };
  }, [possibleDrag, handlePointerMove, selectedIds, id, draggingId]);

  useEffect(() => {
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("touchend", handlePointerUp);
    return (): void => {
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("touchend", handlePointerUp);
    };
  }, [handlePointerUp]);

  const nodeStyle: React.CSSProperties = useMemo(
    () => ({
      pointerEvents: "auto",
      position: "absolute",
    }),
    []
  );

  return (
    <div
      ref={handleNodeRef}
      style={nodeStyle}
      onPointerDown={handlePointerDownNode}
      onPointerUp={handlePointerUpNode}
    >
      <Measure bounds onResize={handleNodeSizeChanged}>
        {({ measureRef }): JSX.Element => (
          <div ref={measureRef}>{children}</div>
        )}
      </Measure>
    </div>
  );
};
