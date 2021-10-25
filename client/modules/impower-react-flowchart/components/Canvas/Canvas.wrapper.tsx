import { motion, useSpring } from "framer-motion";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { defaultFlowchartConfig, FlowChartConfig } from "../../types/config";
import { OnPanCanvas, OnZoomCanvas } from "../../types/functions";
import { Vector2 } from "../../types/generics";
import { CanvasDefault, CanvasDefaultProps } from "./Canvas.default";
// import { clamp } from "../../utils/clamp";
// import { getFocusedOffset, getFocusedPosition } from "../../utils/rect";

const transition = {
  stiffness: 600,
  damping: 1000,
};

// const getVector = (xy?: [number, number]): Vector2 => {
//   if (!xy) {
//     return { x: 0, y: 0 };
//   }
//   return { x: xy[0], y: xy[1] };
// };

// const getPinchZoomScale = (
//   scale: number,
//   movementAmount: number,
//   step: number,
//   minScale: number,
//   maxScale: number
// ): number => {
//   if (movementAmount < 0) {
//     return clamp(scale / step, minScale, maxScale);
//   }
//   if (movementAmount > 0) {
//     return clamp(scale * step, minScale, maxScale);
//   }
//   return scale;
// };

// const getWheelZoomScale = (
//   scale: number,
//   scaleMovement: Vector2,
//   step: number,
//   minScale: number,
//   maxScale: number
// ): number => {
//   if (scaleMovement.x > 0 || scaleMovement.y > 0) {
//     return clamp(scale / step, minScale, maxScale);
//   }
//   if (scaleMovement.x < 0 || scaleMovement.y < 0) {
//     return clamp(scale * step, minScale, maxScale);
//   }
//   return scale;
// };

export interface CanvasWrapperProps {
  config?: FlowChartConfig;
  defaultOffset: Vector2;
  defaultScale: number;
  size: Vector2;
  allowPan: boolean;
  forcedScale?: { value: number };
  forcedOffset?: { value: Vector2 };
  scrollParent?: HTMLElement | null;
  onPanCanvasStart: OnPanCanvas;
  onPanCanvas: OnPanCanvas;
  onPanCanvasStop: OnPanCanvas;
  onForcedPanCanvas: OnPanCanvas;
  onZoomCanvasStart: OnZoomCanvas;
  onZoomCanvas: OnZoomCanvas;
  onZoomCanvasStop: OnZoomCanvas;
  onForcedZoomCanvas: OnZoomCanvas;
  onChartAreaRef?: (instance: HTMLDivElement | null) => void;
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
    // allowPan,
    // onPanCanvasStart,
    // onZoomCanvasStart,
    onPanCanvas,
    onPanCanvasStop,
    onForcedPanCanvas,
    onZoomCanvas,
    onZoomCanvasStop,
    onForcedZoomCanvas,
    onChartAreaRef,
    children = CanvasDefault,
  } = props;
  const [chartAreaElement, setChartAreaElement] = useState<HTMLDivElement>();
  const scale = useRef(defaultScale);
  const controllingRef = useRef(false);
  const gridColor =
    config?.canvasConfig?.options?.gridColor ||
    defaultFlowchartConfig.canvasConfig.options.gridColor;
  const gridSize =
    config?.canvasConfig?.options?.gridSize ||
    defaultFlowchartConfig.canvasConfig.options.gridSize;
  // const focusedPosition = useRef<{
  //   focusChartPosition: Vector2;
  //   focusScrollPosition: Vector2;
  // }>();
  // const panningEnabled = useRef(allowPan);
  // const mouseDraggingButton = useRef(-1);
  // const mouseDragStartOffset = useRef<Vector2>(defaultOffset);
  // const minScale =
  //   config?.canvasConfig?.options?.minScale ||
  //   defaultFlowchartConfig.canvasConfig.options.minScale;
  // const maxScale =
  //   config?.canvasConfig?.options?.maxScale ||
  //   defaultFlowchartConfig.canvasConfig.options.maxScale;
  // const pinchDisabled =
  //   config?.canvasConfig?.pinch?.disabled ||
  //   defaultFlowchartConfig.canvasConfig.pinch.disabled;
  // const pinchStep =
  //   config?.canvasConfig?.pinch?.step ||
  //   defaultFlowchartConfig.canvasConfig.pinch.step;
  // const wheelDisabled =
  //   config?.canvasConfig?.wheel?.disabled ||
  //   defaultFlowchartConfig.canvasConfig.wheel.disabled;
  // const wheelStep =
  //   config?.canvasConfig?.wheel?.step ||
  //   defaultFlowchartConfig.canvasConfig.wheel.step;
  // const panDisabled =
  //   config?.canvasConfig?.pan?.disabled ||
  //   defaultFlowchartConfig.canvasConfig.pan.disabled;

  const getCurrentOffset = (): Vector2 => {
    if (scrollParent) {
      return {
        x: scrollParent.scrollLeft,
        y: scrollParent.scrollTop,
      };
    }
    return defaultOffset;
  };
  const setCurrentOffset = (newOffset: Vector2): void => {
    if (scrollParent) {
      scrollParent.scrollLeft = newOffset.x;
      scrollParent.scrollTop = newOffset.y;
    }
  };

  const offsetXSpring = useSpring(getCurrentOffset().x, transition);
  const offsetYSpring = useSpring(getCurrentOffset().y, transition);
  const scaleSpring = useSpring(scale.current, transition);

  // TODO: Fix to use event listeners instead;
  // const bind = useGesture(
  //   {
  //     onPinchStart: (state) => {
  //       if (!pinchDisabled) {
  //         const event = state.event as React.BaseSyntheticEvent;
  //         event.preventDefault();
  //         controllingRef.current = true;
  //         if (scrollParent && chartAreaElement) {
  //           const scrollPosition = scrollParent.getBoundingClientRect();
  //           const chartPosition = chartAreaElement.getBoundingClientRect();
  //           focusedPosition.current = getFocusedPosition(
  //             scrollPosition,
  //             chartPosition,
  //             scale.current,
  //             getVector(state.origin)
  //           );
  //         }
  //         onZoomCanvasStart({
  //           scale: scale.current,
  //           event: state.event,
  //         });
  //       }
  //     },
  //     onPinch: (state) => {
  //       if (!pinchDisabled && !scaleSpring.isAnimating()) {
  //         const event = state.event as React.BaseSyntheticEvent;
  //         event.preventDefault();
  //         controllingRef.current = true;
  //         const newScale = getPinchZoomScale(
  //           scale.current,
  //           state.movement[0],
  //           pinchStep,
  //           minScale,
  //           maxScale
  //         );
  //         scaleSpring.set(newScale, false);
  //         if (chartAreaElement) {
  //           chartAreaElement.style.transform = `scale(${newScale})`;
  //         }
  //         if (scrollParent && chartAreaElement && scale.current !== newScale) {
  //           const focusedOffset = getFocusedOffset(
  //             focusedPosition.current.focusScrollPosition,
  //             focusedPosition.current.focusChartPosition,
  //             newScale
  //           );
  //           setCurrentOffset(focusedOffset);
  //         }
  //         scale.current = newScale;
  //         onZoomCanvas({
  //           scale: newScale,
  //           event: state.event,
  //         });
  //       }
  //     },
  //     onPinchEnd: (state) => {
  //       if (!pinchDisabled && !scaleSpring.isAnimating()) {
  //         const event = state.event as React.BaseSyntheticEvent;
  //         event.preventDefault();
  //         controllingRef.current = false;
  //         onZoomCanvasStop({
  //           scale: scale.current,
  //           event: state.event,
  //         });
  //       }
  //     },
  //     onWheelStart: (state) => {
  //       if (!wheelDisabled) {
  //         const event = state.event as React.WheelEvent;
  //         event.preventDefault();
  //         controllingRef.current = true;
  //         if (scrollParent && chartAreaElement) {
  //           const scrollPosition = scrollParent.getBoundingClientRect();
  //           const chartPosition = chartAreaElement.getBoundingClientRect();
  //           focusedPosition.current = getFocusedPosition(
  //             scrollPosition,
  //             chartPosition,
  //             scale.current,
  //             { x: event.clientX, y: event.clientY }
  //           );
  //         }
  //         onZoomCanvasStart({
  //           scale: scale.current,
  //           event: state.event,
  //         });
  //       }
  //     },
  //     onWheel: (state) => {
  //       if (!wheelDisabled && !scaleSpring.isAnimating()) {
  //         const event = state.event as React.WheelEvent;
  //         event.preventDefault();
  //         controllingRef.current = true;
  //         const newScale = getWheelZoomScale(
  //           scale.current,
  //           getVector(state.movement),
  //           wheelStep,
  //           minScale,
  //           maxScale
  //         );
  //         scaleSpring.set(newScale, false);
  //         if (chartAreaElement) {
  //           chartAreaElement.style.transform = `scale(${newScale})`;
  //         }
  //         if (scrollParent && chartAreaElement && scale.current !== newScale) {
  //           const focusedOffset = getFocusedOffset(
  //             focusedPosition.current.focusScrollPosition,
  //             focusedPosition.current.focusChartPosition,
  //             newScale
  //           );
  //           setCurrentOffset(focusedOffset);
  //         }
  //         scale.current = newScale;
  //         onZoomCanvas({
  //           scale: newScale,
  //           event: state.event,
  //         });
  //       }
  //     },
  //     onWheelEnd: (state) => {
  //       if (!wheelDisabled && !scaleSpring.isAnimating()) {
  //         const event = state.event as React.WheelEvent;
  //         event.preventDefault();
  //         controllingRef.current = false;
  //         onZoomCanvasStop({
  //           scale: scale.current,
  //           event: state.event,
  //         });
  //       }
  //     },
  //     onScrollStart: (state) => {
  //       if (!panDisabled && allowPan) {
  //         const newOffset = getVector(state.xy);
  //         onPanCanvasStart({
  //           offset: newOffset,
  //           event: state.event,
  //         });
  //       }
  //     },
  //     onScroll: (state) => {
  //       if (!panDisabled && allowPan) {
  //         const newOffset = getVector(state.xy);
  //         offsetXSpring.set(newOffset.x, false);
  //         offsetYSpring.set(newOffset.y, false);
  //         onPanCanvas({
  //           offset: newOffset,
  //           event: state.event,
  //         });
  //       }
  //     },
  //     onScrollEnd: (state) => {
  //       if (!panDisabled && allowPan) {
  //         const newOffset = getVector(state.xy);
  //         offsetXSpring.set(newOffset.x, false);
  //         offsetYSpring.set(newOffset.y, false);
  //         onPanCanvasStop({
  //           offset: newOffset,
  //           event: state.event,
  //         });
  //       }
  //     },
  //     onDragStart: (state) => {
  //       if (!panDisabled && allowPan) {
  //         // 'Drag to scroll' is automatically handled on touch based browsers,
  //         // So we only need to add this functionality for mouse based interfaces
  //         if (state.event?.type === "mousedown") {
  //           const mouseEvent = state.event as unknown as MouseEvent;
  //           if (mouseEvent) {
  //             mouseDraggingButton.current = mouseEvent.button;
  //             mouseDragStartOffset.current = getCurrentOffset();
  //           }
  //         }
  //       }
  //     },
  //     onDrag: (state) => {
  //       if (!panDisabled && allowPan && panningEnabled.current) {
  //         if (
  //           mouseDraggingButton.current === 0 &&
  //           !offsetXSpring.isAnimating() &&
  //           !offsetYSpring.isAnimating()
  //         ) {
  //           const event = state.event as React.BaseSyntheticEvent;
  //           const activeHTMLElement = document.activeElement as HTMLElement;
  //           if (activeHTMLElement && activeHTMLElement.blur) {
  //             activeHTMLElement.blur();
  //           }
  //           event.preventDefault();
  //           const newOffset = {
  //             x: mouseDragStartOffset.current.x - state.movement[0],
  //             y: mouseDragStartOffset.current.y - state.movement[1],
  //           };
  //           setCurrentOffset(newOffset);
  //         }
  //       }
  //       if (!allowPan) {
  //         // If panning is disallowed at any point during dragging, keep it disallowed until the drag ends.
  //         panningEnabled.current = allowPan;
  //       }
  //     },
  //     onDragEnd: () => {
  //       mouseDraggingButton.current = -1;
  //       panningEnabled.current = allowPan;
  //     },
  //   },
  //   {
  //     domTarget: scrollParent || undefined,
  //     eventOptions: { passive: false },
  //   }
  // );

  const handleChartAreaRef = useCallback(
    (instance: HTMLDivElement) => {
      if (instance) {
        setChartAreaElement(instance);
        if (onChartAreaRef) {
          onChartAreaRef(instance);
        }
      }
    },
    [onChartAreaRef]
  );

  const updateOffsetX = (value: number): void => {
    if (!controllingRef.current && scrollParent) {
      scrollParent.scrollLeft = value;
      if (value === forcedOffset?.value.x) {
        onPanCanvasStop({
          offset: { x: value, y: scrollParent.scrollTop },
        });
      } else {
        onPanCanvas({
          offset: { x: value, y: scrollParent.scrollTop },
        });
      }
    }
  };
  const updateOffsetY = (value: number): void => {
    if (!controllingRef.current && scrollParent) {
      scrollParent.scrollTop = value;
      if (value === forcedOffset?.value.y) {
        onPanCanvasStop({
          offset: { x: scrollParent.scrollLeft, y: value },
        });
      } else {
        onPanCanvas({
          offset: { x: scrollParent.scrollLeft, y: value },
        });
      }
    }
  };
  const updateScale = (value: number): void => {
    if (!controllingRef.current) {
      scale.current = value;
      if (chartAreaElement) {
        chartAreaElement.style.transform = `scale(${value})`;
      }
      if (value === forcedScale?.value) {
        onZoomCanvasStop({ scale: value });
      } else {
        onZoomCanvas({ scale: value });
      }
    }
  };

  useEffect(() => {
    setCurrentOffset(defaultOffset);
    onPanCanvas({ offset: defaultOffset });
    onPanCanvasStop({ offset: defaultOffset });
  }, [defaultOffset, scrollParent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scaleSpring.set(defaultScale, false);
    scale.current = defaultScale;
    if (chartAreaElement) {
      chartAreaElement.style.transform = `scale(${defaultScale})`;
    }
    onZoomCanvas({ scale: defaultScale });
    onZoomCanvasStop({ scale: defaultScale });
  }, [defaultScale, chartAreaElement]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribeOffsetX = offsetXSpring.onRenderRequest(updateOffsetX);
    const unsubscribeOffsetY = offsetYSpring.onRenderRequest(updateOffsetY);

    if (forcedOffset) {
      const currentOffset = getCurrentOffset();
      if (
        currentOffset.x !== forcedOffset.value.x ||
        currentOffset.y !== forcedOffset.value.y
      ) {
        offsetXSpring.set(forcedOffset.value.x);
        offsetYSpring.set(forcedOffset.value.y);
      }
      onForcedPanCanvas({ offset: forcedOffset.value });
    }

    return (): void => {
      unsubscribeOffsetX();
      unsubscribeOffsetY();
    };
  }, [forcedOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribeScale = scaleSpring.onRenderRequest(updateScale);

    if (forcedScale) {
      if (scale.current !== forcedScale.value) {
        scaleSpring.set(forcedScale.value);
      }
      onForcedZoomCanvas({ scale: forcedScale.value });
    }

    return (): void => {
      unsubscribeScale();
    };
  }, [forcedScale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={"StyledCanvasWrapper"}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: "100%",
      }}
    >
      <motion.div
        className={"StyledCanvasScrollArea"}
        // {...bind()}
        style={{
          transform: `translate(0px, 0px)`,
        }}
      >
        <motion.div
          className={"StyledChartArea"}
          ref={handleChartAreaRef}
          style={{
            position: "absolute",
            transformOrigin: "top left",
            minWidth: size.x,
            minHeight: size.y,
          }}
        >
          {children({
            gridColor,
            gridSize,
            size,
          })}
        </motion.div>
      </motion.div>
    </div>
  );
};
