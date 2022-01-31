import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Chart, Node } from "../types/chart";
import { defaultFlowchartConfig, FlowChartConfig } from "../types/config";
import {
  OnDragNode,
  OnNodeSizeChanged,
  OnNodeSizeDetermined,
  OnNodeSizeInput,
  OnPanCanvas,
  OnPanCanvasInput,
  OnTapNode,
  OnTapNodeInput,
  OnZoomCanvas,
  OnZoomCanvasInput,
} from "../types/functions";
import { Vector2 } from "../types/generics";
import { CanvasDefault, CanvasDefaultProps } from "./Canvas/Canvas.default";
import { CanvasWrapper } from "./Canvas/Canvas.wrapper";
import { FlowchartNodeProvided } from "./FlowchartNode";
import { LinkDefault, LinkDefaultProps } from "./Link/Link.default";
import { LinkWrapper } from "./Link/Link.wrapper";

const getInitialNodePositions = (nodes: {
  [id: string]: Node;
}): { [id: string]: Vector2 } => {
  const nodePositions: {
    [id: string]: Vector2;
  } = {};
  Object.values(nodes).forEach((node) => {
    nodePositions[node.id] = nodes[node.id].defaultPosition;
  });
  return nodePositions;
};

const getInitialNodeVectors = (nodes: {
  [id: string]: Node;
}): { [id: string]: Vector2 } => {
  const nodeVectors: {
    [id: string]: Vector2;
  } = {};
  Object.values(nodes).forEach((node) => {
    nodeVectors[node.id] = { x: 0, y: 0 };
  });
  return nodeVectors;
};

export interface FlowChartCallbacks {
  onDragHandleTrigger?: (event: PointerEvent | React.PointerEvent) => void;
  onPointerDownNode?: OnTapNode;
  onPointerUpNode?: OnTapNode;
  onDragNodeForced?: OnDragNode;
  onDragNodeCapture?: OnDragNode;
  onDragNodeStart?: OnDragNode;
  onDragNode?: OnDragNode;
  onDragNodeEnd?: OnDragNode;
  onNodeSizeDetermined?: OnNodeSizeDetermined;
  onNodeSizeChanged?: OnNodeSizeChanged;
  onPanCanvasStart?: OnPanCanvas;
  onPanCanvas?: OnPanCanvas;
  onPanCanvasStop?: OnPanCanvas;
  onForcedPanCanvas?: OnPanCanvas;
  onZoomCanvasStart?: OnZoomCanvas;
  onZoomCanvas?: OnZoomCanvas;
  onZoomCanvasStop?: OnZoomCanvas;
  onForcedZoomCanvas?: OnZoomCanvas;
}

export interface FlowChartComponents {
  ComponentCanvas?: (props: CanvasDefaultProps) => JSX.Element | null;
  ComponentLink?: (props: LinkDefaultProps) => JSX.Element | null;
}

export interface FlowChartProps
  extends FlowChartCallbacks,
    FlowChartComponents {
  chart: Chart;
  defaultOffset: Vector2;
  defaultScale: number;
  chartSize: Vector2;
  selectedIds?: string[];
  scrollThreshold?: number;
  scrollSpeed?: number;
  forcedOffset?: { value: Vector2 }; // When this property changes, the chart will be forcably panned to the specified offset
  forcedScale?: { value: number }; // When this property changes, the chart will be forcably zoomed to the specified scale
  config?: FlowChartConfig;
  scrollParent?: HTMLElement | null;
  chartAreaRef?: React.Ref<HTMLDivElement>;
  children: (props: FlowchartNodeProvided) => JSX.Element | null;
}

export const Flowchart = (props: FlowChartProps): JSX.Element => {
  const {
    chart,
    defaultOffset,
    defaultScale,
    chartSize,
    selectedIds,
    scrollThreshold = 80,
    scrollSpeed = 0.1,
    forcedOffset,
    forcedScale,
    config = defaultFlowchartConfig,
    scrollParent,
    chartAreaRef,
    onPointerDownNode,
    onPointerUpNode,
    onDragNodeForced,
    onDragNodeCapture,
    onDragNodeStart,
    onDragNode,
    onDragNodeEnd,
    onPanCanvasStart,
    onPanCanvas,
    onPanCanvasStop,
    onForcedPanCanvas,
    onZoomCanvasStart,
    onZoomCanvas,
    onZoomCanvasStop,
    onForcedZoomCanvas,
    onNodeSizeDetermined,
    onNodeSizeChanged,
    ComponentCanvas = CanvasDefault,
    ComponentLink = LinkDefault,
    children,
  } = props;

  const [localChart, setLocalChart] = useState(chart);
  const [scale, setScale] = useState(defaultScale);
  const [draggingId, setDraggingId] = useState<string>();
  const [startDraggingPosition, setStartDraggingPosition] = useState<Vector2>();

  const ref = useRef<HTMLDivElement>(null);
  const nodePositionsRef = useRef<{
    [id: string]: Vector2;
  }>(getInitialNodePositions(chart.nodes));
  const nodeSizesRef = useRef<{
    [id: string]: Vector2;
  }>(getInitialNodeVectors(chart.nodes));
  const nodeElementsRef = React.useRef<{
    [id: string]: HTMLElement;
  }>({});
  const [nodePositions, setNodePositions] = useState(nodePositionsRef.current);
  const [nodeSizes, setNodeSizes] = useState(nodeSizesRef.current);

  // Use the localChart state only for links.
  // This prevents sync issues when chart changes during copy and pasting since the link wrapper will attempt to access that hasn't been created yet.
  const { links } = localChart;

  const snapToGridSize = config.canvasConfig?.options?.gridSize || 1;

  const handleNodeSizeDetermined = useCallback(
    (input: OnNodeSizeInput): void => {
      const newNodeSizes = {
        ...nodeSizesRef.current,
        [input.id]: { ...input.size },
      };
      nodeSizesRef.current = newNodeSizes;
      setNodePositions(nodeSizesRef.current);
      onNodeSizeDetermined?.(input);
    },
    [nodeSizesRef, onNodeSizeDetermined]
  );

  const handleNodeSizeChanged = useCallback(
    (input: OnNodeSizeInput): void => {
      const newNodeSizes = {
        ...nodeSizesRef.current,
        [input.id]: { ...input.size },
      };
      nodeSizesRef.current = newNodeSizes;
      setNodeSizes(nodeSizesRef.current);
      onNodeSizeChanged?.(input);
    },
    [nodeSizesRef, onNodeSizeChanged]
  );

  const handlePointerDownNode = useCallback(
    (input: OnTapNodeInput): void => {
      if (scrollParent) {
        scrollParent.style.overflow = "hidden";
      }
      onPointerDownNode?.(input);
    },
    [onPointerDownNode, scrollParent]
  );

  const handlePointerUpNode = useCallback(
    (input: OnTapNodeInput): void => {
      onPointerUpNode?.(input);
    },
    [onPointerUpNode]
  );

  const handlePointerUp = useCallback((): void => {
    if (scrollParent) {
      scrollParent.style.overflow = "auto";
    }
  }, [scrollParent]);

  const handleTouchEnd = useCallback((): void => {
    if (scrollParent) {
      scrollParent.style.overflow = "auto";
    }
  }, [scrollParent]);

  const handleDragNodeForced = useCallback(
    ({ id, position, event }): void => {
      nodePositionsRef.current[id] = { ...position };
      onDragNodeForced?.({ id, position, event });
    },
    [onDragNodeForced]
  );

  const handleDragNodeCapture = useCallback(
    ({ id, position, event }): void => {
      nodePositionsRef.current[id] = { ...position };
      setDraggingId(id);
      setStartDraggingPosition(position);
      onDragNodeCapture?.({ id, position, event });
    },
    [onDragNodeCapture]
  );

  const handleDragNodeStart = useCallback(
    ({ id, position, event }): void => {
      nodePositionsRef.current[id] = { ...position };
      onDragNodeStart?.({ id, position, event });
    },
    [onDragNodeStart]
  );

  const handleDragNode = useCallback(
    ({ id, position, event }): void => {
      nodePositionsRef.current[id] = { ...position };
      onDragNode?.({ id, position, event });
    },
    [onDragNode]
  );

  const handleDragNodeEnd = useCallback(
    ({ id, position, event }): void => {
      nodePositionsRef.current[id] = { ...position };
      setDraggingId(null);
      onDragNodeEnd?.({ id, position, event });
    },
    [onDragNodeEnd]
  );

  const handlePanCanvasStart = useCallback(
    (input: OnPanCanvasInput): void => {
      onPanCanvasStart?.(input);
    },
    [onPanCanvasStart]
  );

  const handlePanCanvas = useCallback(
    (input: OnPanCanvasInput): void => {
      onPanCanvas?.(input);
    },
    [onPanCanvas]
  );

  const handlePanCanvasStop = useCallback(
    (input: OnPanCanvasInput): void => {
      onPanCanvasStop?.(input);
    },
    [onPanCanvasStop]
  );

  const handleZoomCanvasStart = useCallback(
    (input: OnZoomCanvasInput): void => {
      onZoomCanvasStart?.(input);
    },
    [onZoomCanvasStart]
  );

  const handleZoomCanvas = useCallback(
    (input: OnZoomCanvasInput): void => {
      setScale(input.scale);
      onZoomCanvas?.(input);
    },
    [onZoomCanvas]
  );

  const handleZoomCanvasStop = useCallback(
    (input: OnZoomCanvasInput): void => {
      setScale(input.scale);
      onZoomCanvasStop?.(input);
    },
    [onZoomCanvasStop]
  );

  const handleNodeRef = useCallback(
    (id: string, instance: HTMLDivElement | null) => {
      nodeElementsRef.current[id] = instance;
    },
    []
  );
  const linkArray = useMemo(() => Object.values(links), [links]);

  useEffect(() => {
    setLocalChart(chart);
    nodePositionsRef.current = getInitialNodePositions(chart.nodes);
    setNodePositions(nodePositionsRef.current);
  }, [chart, chart.nodes]);

  useEffect(() => {
    document.addEventListener("touchend", handleTouchEnd);
    return (): void => {
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchEnd]);

  useEffect(() => {
    document.addEventListener("pointerup", handlePointerUp);
    return (): void => {
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerUp]);

  return (
    <div
      className={"StyledFlowchart"}
      ref={ref}
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
      <CanvasWrapper
        config={config}
        defaultOffset={defaultOffset}
        defaultScale={defaultScale}
        forcedOffset={forcedOffset}
        forcedScale={forcedScale}
        size={chartSize}
        scrollParent={scrollParent}
        chartAreaRef={chartAreaRef}
        onPanCanvasStart={handlePanCanvasStart}
        onPanCanvas={handlePanCanvas}
        onPanCanvasStop={handlePanCanvasStop}
        onForcedPanCanvas={onForcedPanCanvas}
        onZoomCanvasStart={handleZoomCanvasStart}
        onZoomCanvas={handleZoomCanvas}
        onZoomCanvasStop={handleZoomCanvasStop}
        onForcedZoomCanvas={onForcedZoomCanvas}
      >
        {({ gridColor, gridSize, size }): JSX.Element => (
          <ComponentCanvas
            gridColor={gridColor}
            gridSize={gridSize}
            size={size}
          >
            <div
              className={"StyledDraggableArea"}
              style={{ width: 0, height: 0 }}
            >
              {linkArray.map((link) => {
                return (
                  <LinkWrapper
                    config={config}
                    key={link.id}
                    fromNodeId={link.fromNodeId}
                    toNodeId={link.toNodeId}
                    fromPosition={nodePositions?.[link.fromNodeId]}
                    toPosition={nodePositions?.[link.toNodeId]}
                    fromSize={nodeSizes?.[link.fromNodeId]}
                    toSize={nodeSizes?.[link.toNodeId]}
                    selectedIds={selectedIds}
                  >
                    {({
                      fromNodeId,
                      toNodeId,
                      startPosition,
                      endPosition,
                      startSide,
                      endSide,
                      linkColor,
                      lineStrokeWidth,
                      arrowSize,
                      arrowStrokeWidth,
                    }): JSX.Element => (
                      <ComponentLink
                        fromNodeId={fromNodeId}
                        toNodeId={toNodeId}
                        startPosition={startPosition}
                        endPosition={endPosition}
                        startSide={startSide}
                        endSide={endSide}
                        linkColor={linkColor}
                        lineStrokeWidth={lineStrokeWidth}
                        arrowSize={arrowSize}
                        arrowStrokeWidth={arrowStrokeWidth}
                      />
                    )}
                  </LinkWrapper>
                );
              })}
              {/* The nodes */}
              {children({
                scale,
                scrollParent,
                scrollThreshold,
                scrollSpeed,
                snapToGridSize,
                draggingId,
                startDraggingPosition,
                selectedIds,
                chartSize,
                nodeSizes,
                nodeElements: nodeElementsRef.current,
                onPointerDownNode: handlePointerDownNode,
                onPointerUpNode: handlePointerUpNode,
                onDragNodeForced: handleDragNodeForced,
                onDragNodeCapture: handleDragNodeCapture,
                onDragNodeStart: handleDragNodeStart,
                onDragNode: handleDragNode,
                onDragNodeEnd: handleDragNodeEnd,
                onNodeSizeDetermined: handleNodeSizeDetermined,
                onNodeSizeChanged: handleNodeSizeChanged,
                onNodeRef: handleNodeRef,
              })}
            </div>
          </ComponentCanvas>
        )}
      </CanvasWrapper>
    </div>
  );
};
