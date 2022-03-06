import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { defaultFlowchartConfig, FlowChartConfig } from "../../types/config";
import { OnPanCanvas, OnZoomCanvas } from "../../types/functions";
import { Vector2 } from "../../types/generics";
import { clamp } from "../../utils/clamp";
import { getFocusedOffset, getFocusedPosition } from "../../utils/rect";
import { CanvasDefault, CanvasDefaultProps } from "./Canvas.default";

const getCenter = (v1: number, v2: number): number => {
  return (v1 + v2) / 2;
};

const getTouchPageCenter = (
  event: TouchEvent | React.TouchEvent
): { x: number; y: number } => {
  return {
    x: getCenter(event.touches[0].pageX, event.touches[1].pageX),
    y: getCenter(event.touches[0].pageY, event.touches[1].pageY),
  };
};

const getTouchPageDistance = (event: TouchEvent | React.TouchEvent): number => {
  return Math.hypot(
    event.touches[0].pageX - event.touches[1].pageX,
    event.touches[0].pageY - event.touches[1].pageY
  );
};

const getPinchZoomScale = (
  scale: number,
  movementAmount: number,
  step: number,
  minScale: number,
  maxScale: number
): number => {
  if (movementAmount < 0) {
    return clamp(scale / step, minScale, maxScale);
  }
  if (movementAmount > 0) {
    return clamp(scale * step, minScale, maxScale);
  }
  return scale;
};

const getWheelZoomScale = (
  scale: number,
  scaleMovement: Vector2,
  step: number,
  minScale: number,
  maxScale: number
): number => {
  if (scaleMovement.x > 0 || scaleMovement.y > 0) {
    return clamp(scale / step, minScale, maxScale);
  }
  if (scaleMovement.x < 0 || scaleMovement.y < 0) {
    return clamp(scale * step, minScale, maxScale);
  }
  return scale;
};

const getScrollOffset = (scrollParent: HTMLElement): Vector2 => {
  if (!scrollParent) {
    return { x: 0, y: 0 };
  }
  if (scrollParent === document.documentElement) {
    return { x: window.scrollX, y: window.scrollY };
  }
  return {
    x: scrollParent.scrollLeft,
    y: scrollParent.scrollTop,
  };
};

const setScrollOffset = (
  scrollParent: HTMLElement,
  newOffset: Vector2
): void => {
  if (!scrollParent) {
    return;
  }
  if (scrollParent === document.documentElement) {
    window.scroll({
      left: newOffset.x,
      top: newOffset.y,
    });
  }
  scrollParent.scrollLeft = newOffset.x;
  scrollParent.scrollTop = newOffset.y;
};

export interface CanvasWrapperProps {
  config?: FlowChartConfig;
  defaultOffset: Vector2;
  defaultScale: number;
  size: Vector2;
  forcedScale?: { value: number };
  forcedOffset?: { value: Vector2 };
  scrollParent?: HTMLElement | null;
  chartAreaRef?: React.Ref<HTMLDivElement>;
  onPanCanvasStart: OnPanCanvas;
  onPanCanvas: OnPanCanvas;
  onPanCanvasStop: OnPanCanvas;
  onForcedPanCanvas: OnPanCanvas;
  onZoomCanvasStart: OnZoomCanvas;
  onZoomCanvas: OnZoomCanvas;
  onZoomCanvasStop: OnZoomCanvas;
  onForcedZoomCanvas: OnZoomCanvas;
  children?: (props: CanvasDefaultProps) => JSX.Element | null;
}

export const CanvasWrapper = (props: CanvasWrapperProps): JSX.Element => {
  const {
    config = defaultFlowchartConfig,
    defaultOffset,
    defaultScale,
    forcedOffset,
    forcedScale,
    size,
    scrollParent,
    chartAreaRef,
    onZoomCanvasStart,
    onPanCanvasStart,
    onPanCanvas,
    onPanCanvasStop,
    onForcedPanCanvas,
    onZoomCanvas,
    onZoomCanvasStop,
    onForcedZoomCanvas,
    children = CanvasDefault,
  } = props;

  const gridColor =
    config?.canvasConfig?.options?.gridColor ||
    defaultFlowchartConfig.canvasConfig.options.gridColor;
  const gridSize =
    config?.canvasConfig?.options?.gridSize ||
    defaultFlowchartConfig.canvasConfig.options.gridSize;
  const focusedPosition = useRef<{
    focusChartPosition: Vector2;
    focusScrollPosition: Vector2;
  }>();
  const minScale =
    config?.canvasConfig?.options?.minScale ||
    defaultFlowchartConfig.canvasConfig.options.minScale;
  const maxScale =
    config?.canvasConfig?.options?.maxScale ||
    defaultFlowchartConfig.canvasConfig.options.maxScale;
  const pinchDisabled =
    config?.canvasConfig?.pinch?.disabled ||
    defaultFlowchartConfig.canvasConfig.pinch.disabled;
  const pinchStep =
    config?.canvasConfig?.pinch?.step ||
    defaultFlowchartConfig.canvasConfig.pinch.step;
  const wheelDisabled =
    config?.canvasConfig?.wheel?.disabled ||
    defaultFlowchartConfig.canvasConfig.wheel.disabled;
  const wheelStep =
    config?.canvasConfig?.wheel?.step ||
    defaultFlowchartConfig.canvasConfig.wheel.step;
  const panDisabled =
    config?.canvasConfig?.pan?.disabled ||
    defaultFlowchartConfig.canvasConfig.pan.disabled;

  const [chartAreaElement, setChartAreaElement] = useState<HTMLDivElement>();

  const mouseDraggingRef = useRef(false);
  const startScrollXRef = useRef<number>();
  const startScrollYRef = useRef<number>();
  const startClientXRef = useRef<number>();
  const startClientYRef = useRef<number>();
  const startTouchCenterRef = useRef<Vector2>();
  const startTouchDistanceRef = useRef<number>();
  const scaleRef = useRef(defaultScale);
  const wheelingRef = useRef(false);
  const scrollingRef = useRef(false);
  const pinchingRef = useRef(false);
  const pointerDownRef = useRef(false);

  const updateScale = useCallback(
    (element: HTMLElement, value: number): void => {
      scaleRef.current = value;
      if (!element) {
        return;
      }
      element.style.transform = `scale(${value})`;
    },
    []
  );

  const updateCursor = useCallback((element: HTMLElement) => {
    if (!element) {
      return;
    }
    element.style.cursor = mouseDraggingRef.current
      ? "grabbing"
      : !pointerDownRef.current
      ? "grab"
      : "pointer";
  }, []);

  const handleScrollStart = useCallback(
    (event: Event) => {
      const newOffset = getScrollOffset(scrollParent);
      onPanCanvasStart?.({
        offset: newOffset,
        event,
      });
    },
    [onPanCanvasStart, scrollParent]
  );

  const handleScroll = useCallback(
    (event: Event) => {
      if (!scrollingRef.current) {
        scrollingRef.current = true;
        handleScrollStart(event);
      }
      const newOffset = getScrollOffset(scrollParent);
      onPanCanvas?.({
        offset: newOffset,
        event,
      });
    },
    [handleScrollStart, onPanCanvas, scrollParent]
  );

  const handleScrollEnd = useCallback(
    (event: Event) => {
      const newOffset = getScrollOffset(scrollParent);
      onPanCanvasStop?.({
        offset: newOffset,
        event,
      });
    },
    [onPanCanvasStop, scrollParent]
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent) => {
      pinchingRef.current = true;
      if (event.touches.length === 2) {
        if (!pinchDisabled) {
          event.preventDefault();

          // Calculate where the fingers have started on the X and Y axis
          startTouchCenterRef.current = getTouchPageCenter(event);
          startTouchDistanceRef.current = getTouchPageDistance(event);

          if (scrollParent && chartAreaElement) {
            const scrollPosition = scrollParent.getBoundingClientRect();
            const chartPosition = chartAreaElement.getBoundingClientRect();
            focusedPosition.current = getFocusedPosition(
              scrollPosition,
              chartPosition,
              scaleRef.current,
              startTouchCenterRef.current
            );
          }
          onZoomCanvasStart?.({
            scale: scaleRef.current,
            event,
          });
        }
      }
    },
    [chartAreaElement, onZoomCanvasStart, pinchDisabled, scrollParent]
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent | React.TouchEvent) => {
      const imageElement = event.target as HTMLImageElement;
      if (imageElement && event.touches.length === 2 && pinchingRef.current) {
        if (!pinchDisabled) {
          event.preventDefault();

          const newTouchDistance = getTouchPageDistance(event);

          const newScale = getPinchZoomScale(
            scaleRef.current,
            startTouchDistanceRef.current - newTouchDistance,
            pinchStep,
            minScale,
            maxScale
          );
          updateScale(chartAreaElement, newScale);
          if (scrollParent && chartAreaElement) {
            const focusedOffset = getFocusedOffset(
              focusedPosition.current.focusScrollPosition,
              focusedPosition.current.focusChartPosition,
              newScale
            );
            setScrollOffset(scrollParent, focusedOffset);
          }
          onZoomCanvas?.({
            scale: newScale,
            event,
          });
        }
      }
    },
    [
      chartAreaElement,
      maxScale,
      minScale,
      onZoomCanvas,
      pinchDisabled,
      pinchStep,
      scrollParent,
      updateScale,
    ]
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent | React.TouchEvent): void => {
      pinchingRef.current = false;
      if (!pinchDisabled) {
        onZoomCanvasStop?.({
          scale: scaleRef.current,
          event,
        });
      }
      if (scrollingRef.current) {
        scrollingRef.current = false;
        handleScrollEnd(event as Event);
      }
    },
    [handleScrollEnd, onZoomCanvasStop, pinchDisabled]
  );

  const handleWheelStart = useCallback(
    (event: React.WheelEvent) => {
      if (scrollParent && chartAreaElement) {
        const scrollPosition = scrollParent.getBoundingClientRect();
        const chartPosition = chartAreaElement.getBoundingClientRect();
        focusedPosition.current = getFocusedPosition(
          scrollPosition,
          chartPosition,
          scaleRef.current,
          { x: event.clientX, y: event.clientY }
        );
      }
      onZoomCanvasStart?.({
        scale: scaleRef.current,
        event,
      });
    },
    [chartAreaElement, onZoomCanvasStart, scrollParent]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!wheelingRef.current) {
        wheelingRef.current = true;
        handleWheelStart(event);
      }
      if (!wheelDisabled) {
        event.preventDefault();
        const newScale = getWheelZoomScale(
          scaleRef.current,
          { x: event.deltaX, y: event.deltaY },
          wheelStep,
          minScale,
          maxScale
        );
        updateScale(chartAreaElement, newScale);
        if (scrollParent && chartAreaElement) {
          const focusedOffset = getFocusedOffset(
            focusedPosition.current.focusScrollPosition,
            focusedPosition.current.focusChartPosition,
            newScale
          );
          setScrollOffset(scrollParent, focusedOffset);
        }
        onZoomCanvas?.({
          scale: newScale,
          event,
        });
      }
    },
    [
      chartAreaElement,
      handleWheelStart,
      maxScale,
      minScale,
      onZoomCanvas,
      scrollParent,
      updateScale,
      wheelDisabled,
      wheelStep,
    ]
  );

  const handleWheelEnd = useCallback(
    (event: React.WheelEvent) => {
      if (!wheelDisabled) {
        onZoomCanvasStop?.({
          scale: scaleRef.current,
          event,
        });
      }
    },
    [onZoomCanvasStop, wheelDisabled]
  );

  const handleMouseDown = useCallback(
    (event: MouseEvent | React.MouseEvent): void => {
      if (!panDisabled) {
        if (scrollParent) {
          event.preventDefault();
          mouseDraggingRef.current = true;
          startScrollXRef.current = scrollParent.scrollLeft;
          startClientXRef.current = event.clientX;
          startScrollYRef.current = scrollParent.scrollTop;
          startClientYRef.current = event.clientY;
          updateCursor(chartAreaElement);
        }
      }
    },
    [chartAreaElement, panDisabled, scrollParent, updateCursor]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent | React.MouseEvent): void => {
      if (!panDisabled) {
        if (scrollParent && mouseDraggingRef.current) {
          scrollParent.scrollLeft =
            startScrollXRef.current + startClientXRef.current - event.clientX;
          scrollParent.scrollTop =
            startScrollYRef.current + startClientYRef.current - event.clientY;
        }
      }
      if (wheelingRef.current) {
        wheelingRef.current = false;
        handleWheelEnd(undefined);
      }
      updateCursor(chartAreaElement);
    },
    [chartAreaElement, handleWheelEnd, panDisabled, scrollParent, updateCursor]
  );

  const handlePointerDown = useCallback((): void => {
    pointerDownRef.current = true;
    updateCursor(chartAreaElement);
  }, [chartAreaElement, updateCursor]);

  const handlePointerUp = useCallback(
    (event: Event): void => {
      pointerDownRef.current = false;
      mouseDraggingRef.current = false;
      if (scrollingRef.current) {
        scrollingRef.current = false;
        handleScrollEnd(event as Event);
      }
      updateCursor(chartAreaElement);
    },
    [chartAreaElement, handleScrollEnd, updateCursor]
  );

  const handleChartAreaRef = useCallback(
    (instance: HTMLDivElement) => {
      if (instance) {
        setChartAreaElement(instance);
        if (chartAreaRef) {
          if (typeof chartAreaRef === "function") {
            chartAreaRef(instance);
          } else {
            (chartAreaRef as { current: HTMLElement }).current = instance;
          }
        }
      }
    },
    [chartAreaRef]
  );

  useEffect(() => {
    setScrollOffset(scrollParent, defaultOffset);
    onPanCanvas?.({ offset: defaultOffset });
    onPanCanvasStop?.({ offset: defaultOffset });
  }, [defaultOffset, scrollParent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    updateScale(chartAreaElement, defaultScale);
    onZoomCanvas?.({ scale: defaultScale });
    onZoomCanvasStop?.({ scale: defaultScale });
  }, [defaultScale, chartAreaElement]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (forcedOffset) {
      const currentOffset = getScrollOffset(scrollParent);
      if (
        currentOffset.x !== forcedOffset.value.x ||
        currentOffset.y !== forcedOffset.value.y
      ) {
        setScrollOffset(scrollParent, {
          x: forcedOffset.value.x,
          y: forcedOffset.value.y,
        });
      }
      onForcedPanCanvas?.({ offset: forcedOffset.value });
    }
  }, [forcedOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (forcedScale) {
      if (scaleRef.current !== forcedScale.value) {
        updateScale(chartAreaElement, forcedScale.value);
      }
      onForcedZoomCanvas?.({ scale: forcedScale.value });
    }
  }, [forcedScale]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.addEventListener("pointerdown", handlePointerDown);
    return (): void => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [handlePointerDown]);

  useEffect(() => {
    document.addEventListener("pointerup", handlePointerUp);
    return (): void => {
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerUp]);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove, {
      passive: true,
    });
    return (): void => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleMouseMove]);

  useEffect(() => {
    document.addEventListener("touchmove", handleTouchMove);
    return (): void => {
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [handleTouchMove]);

  useEffect(() => {
    document.addEventListener("touchend", handleTouchEnd);
    return (): void => {
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchEnd]);

  useEffect(() => {
    if (scrollParent) {
      scrollParent.addEventListener("scroll", handleScroll);
    }
    return (): void => {
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", handleScroll);
      }
    };
  }, [handleScroll, scrollParent]);

  const wrapperStyle: React.CSSProperties = useMemo(
    () => ({
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: "100%",
      height: "100%",
    }),
    []
  );

  const scrollAreaStyle: React.CSSProperties = useMemo(
    () => ({
      transform: `translate(0px, 0px)`,
    }),
    []
  );

  const chartAreaStyle: React.CSSProperties = useMemo(
    () => ({
      position: "absolute",
      transformOrigin: "top left",
      minWidth: size.x,
      minHeight: size.y,
    }),
    [size.x, size.y]
  );

  return (
    <div className={"StyledCanvasWrapper"} style={wrapperStyle}>
      <div className={"StyledCanvasScrollArea"} style={scrollAreaStyle}>
        <div
          className={"StyledChartArea"}
          role="none"
          ref={handleChartAreaRef}
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          style={chartAreaStyle}
        >
          {children({
            gridColor,
            gridSize,
            size,
          })}
        </div>
      </div>
    </div>
  );
};
