import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import { useMotionValue } from "framer-motion";
import { CanvasDefaultProps, CanvasDefault } from "./Canvas/Canvas.default";
import { CanvasWrapper } from "./Canvas/Canvas.wrapper";
import {
  OnNodeSizeDetermined,
  OnNodeSizeChanged,
  OnPanCanvas,
  OnZoomCanvas,
  OnNodeSizeInput,
  OnPanCanvasInput,
  OnZoomCanvasInput,
  OnTapNodeInput,
  OnTapNode,
  OnMultiDragNode,
  DraggableEvent,
} from "../types/functions";
import { LinkDefaultProps, LinkDefault } from "./Link/Link.default";
import { FlowchartNodeProvided } from "./FlowchartNode";
import { Chart, Node } from "../types/chart";
import { FlowChartConfig, defaultFlowchartConfig } from "../types/config";
import { LinkWrapper } from "./Link/Link.wrapper";
import { Vector2 } from "../types/generics";
import { getSnappedVector } from "../utils/snap";

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
  onDragHandleTrigger?: (event: DraggableEvent) => void;
  onPointerDownNode?: OnTapNode;
  onPointerUpNode?: OnTapNode;
  onTapNodeStart?: OnTapNode;
  onTapNode?: OnTapNode;
  onTapNodeCancel?: OnTapNode;
  onDragNodeForced?: OnMultiDragNode;
  onDragNodeStart?: OnMultiDragNode;
  onDragNode?: OnMultiDragNode;
  onDragNodeEnd?: OnMultiDragNode;
  onDragNodeTransitionEnd?: OnMultiDragNode;
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
  ghostingIds?: string[];
  scrollThreshold?: number;
  scrollSpeed?: number;
  boundsSelector?: string;
  forcedOffset?: { value: Vector2 }; // When this property changes, the chart will be forcably panned to the specified offset
  forcedScale?: { value: number }; // When this property changes, the chart will be forcably zoomed to the specified scale
  config?: FlowChartConfig;
  scrollParent?: HTMLElement | null;
  pressDelay?: number;
  onChartAreaRef?: (instance: HTMLDivElement | null) => void;
  children: (props: FlowchartNodeProvided) => JSX.Element | null;
}

export const Flowchart = (props: FlowChartProps): JSX.Element => {
  const {
    chart,
    defaultOffset,
    defaultScale,
    chartSize,
    ghostingIds = [],
    scrollThreshold = 12,
    scrollSpeed = 0.1,
    boundsSelector = ".StyledChartArea",
    forcedOffset,
    forcedScale,
    config = defaultFlowchartConfig,
    scrollParent,
    pressDelay,
    onDragHandleTrigger,
    onPointerDownNode = (): void => null,
    onPointerUpNode = (): void => null,
    onTapNodeStart = (): void => null,
    onTapNode = (): void => null,
    onTapNodeCancel = (): void => null,
    onDragNodeForced = (): void => null,
    onDragNodeStart = (): void => null,
    onDragNode = (): void => null,
    onDragNodeEnd = (): void => null,
    onDragNodeTransitionEnd = (): void => null,
    onPanCanvasStart = (): void => null,
    onPanCanvas = (): void => null,
    onPanCanvasStop = (): void => null,
    onForcedPanCanvas = (): void => null,
    onZoomCanvasStart = (): void => null,
    onZoomCanvas = (): void => null,
    onZoomCanvasStop = (): void => null,
    onForcedZoomCanvas = (): void => null,
    onNodeSizeDetermined = (): void => null,
    onNodeSizeChanged = (): void => null,
    onChartAreaRef = (): void => null,
    ComponentCanvas = CanvasDefault,
    ComponentLink = LinkDefault,
    children,
  } = props;

  const [localChart, setLocalChart] = useState(chart);
  // Use the localChart state only for links.
  // This prevents sync issues when chart changes during copy and pasting since the link wrapper will attempt to access that hasn't been created yet.
  const { links } = localChart;
  const [scale, setScale] = useState(defaultScale);
  const [allowPan, setAllowPan] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingX = useMotionValue(0);
  const draggingY = useMotionValue(0);
  const draggingOriginX = useMotionValue(0);
  const draggingOriginY = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);
  const nodePositions = useRef<{
    [id: string]: Vector2;
  }>(getInitialNodePositions(chart.nodes));

  const nodeSizes = useRef<{
    [id: string]: Vector2;
  }>(getInitialNodeVectors(chart.nodes));
  const nodeOffsets = useRef<{
    [id: string]: Vector2;
  }>(getInitialNodeVectors(chart.nodes));
  const nodeRefs = React.useRef<{
    [id: string]: HTMLElement | null;
  }>({});
  const [, forceUpdate] = useState({});

  const snapToGridSize = config.canvasConfig?.options?.gridSize || 1;

  const updateNodePositionsWithGhostingOffsets = (
    draggingPosition: Vector2,
    offsets: { [id: string]: Vector2 },
    ghostingNodeIds: string[]
  ): void => {
    ghostingNodeIds.forEach((ghostingNodeId) => {
      const nodeOffset = offsets[ghostingNodeId];
      if (nodeOffset) {
        const nodePosition = {
          x: draggingPosition.x + nodeOffset.x,
          y: draggingPosition.y + nodeOffset.y,
        };
        nodePositions.current[ghostingNodeId] = nodePosition;
      }
    });
  };

  const snapNodePositions = (gridSize: number): void => {
    Object.keys(nodePositions.current).forEach((nodeId) => {
      const nodePosition = nodePositions.current[nodeId];
      nodePositions.current[nodeId] =
        gridSize !== undefined
          ? getSnappedVector(nodePosition, gridSize)
          : nodePosition;
    });
  };

  const updateOffsets = (
    draggingPosition: Vector2,
    positions: { [id: string]: Vector2 }
  ): void => {
    Object.keys(positions).forEach((nodeId) => {
      const nodePosition = positions[nodeId];
      if (nodePosition) {
        nodeOffsets.current[nodeId] = {
          x: nodePosition.x - draggingPosition.x,
          y: nodePosition.y - draggingPosition.y,
        };
      }
    });
  };

  const handleNodeSizeDetermined = useCallback(
    (input: OnNodeSizeInput): void => {
      const newNodeSizes = {
        ...nodeSizes.current,
        [input.id]: { ...input.size },
      };
      nodeSizes.current = newNodeSizes;
      forceUpdate({});
      onNodeSizeDetermined(input);
    },
    [nodeSizes, onNodeSizeDetermined]
  );

  const handleNodeSizeChanged = useCallback(
    (input: OnNodeSizeInput): void => {
      const newNodeSizes = {
        ...nodeSizes.current,
        [input.id]: { ...input.size },
      };
      nodeSizes.current = newNodeSizes;
      forceUpdate({});
      onNodeSizeChanged(input);
    },
    [nodeSizes, onNodeSizeChanged]
  );

  const handlePointerDownNode = useCallback(
    (input: OnTapNodeInput): void => {
      setAllowPan(false);
      onPointerDownNode(input);
    },
    [onPointerDownNode]
  );

  const handlePointerUpNode = useCallback(
    (input: OnTapNodeInput): void => {
      setAllowPan(true);
      onPointerUpNode(input);
    },
    [onPointerUpNode]
  );

  const handleTapNodeStart = useCallback(
    (input: OnTapNodeInput): void => {
      onTapNodeStart(input);
    },
    [onTapNodeStart]
  );

  const handleTapNode = useCallback(
    (input: OnTapNodeInput): void => {
      onTapNode(input);
    },
    [onTapNode]
  );

  const handleTapNodeCancel = useCallback(
    (input: OnTapNodeInput): void => {
      onTapNodeCancel(input);
    },
    [onTapNodeCancel]
  );

  const handleDragNodeForced = useCallback(
    ({ id, position, event }): void => {
      nodePositions.current[id] = { ...position };
      updateNodePositionsWithGhostingOffsets(
        position,
        nodeOffsets.current,
        ghostingIds
      );
      setDraggingId(id);
      setDraggingId(null);
      onDragNodeForced({ id, positions: nodePositions.current, event });
    },
    [nodePositions, nodeOffsets, ghostingIds, onDragNodeForced]
  );

  const handleDragNodeStart = useCallback(
    ({ id, position, event }): void => {
      nodePositions.current[id] = { ...position };
      updateOffsets(position, nodePositions.current);
      setDraggingId(id);
      onDragNodeStart({ id, positions: nodePositions.current, event });
    },
    [onDragNodeStart]
  );

  const handleDragNode = useCallback(
    ({ id, position, event }): void => {
      nodePositions.current[id] = { ...position };
      updateNodePositionsWithGhostingOffsets(
        position,
        nodeOffsets.current,
        ghostingIds
      );
      onDragNode({ id, positions: nodePositions.current, event });
    },
    [nodePositions, ghostingIds, onDragNode]
  );

  const handleDragNodeEnd = useCallback(
    ({ id, position, event }): void => {
      nodePositions.current[id] = { ...position };
      updateNodePositionsWithGhostingOffsets(
        position,
        nodeOffsets.current,
        ghostingIds
      );
      onDragNodeEnd({ id, positions: nodePositions.current, event });
    },
    [ghostingIds, onDragNodeEnd]
  );

  const handleDragNodeTransitionEnd = useCallback(
    ({ id, position, event }): void => {
      nodePositions.current[id] = { ...position };
      updateNodePositionsWithGhostingOffsets(
        position,
        nodeOffsets.current,
        ghostingIds
      );
      snapNodePositions(snapToGridSize);
      setDraggingId(null);
      onDragNodeTransitionEnd({ id, positions: nodePositions.current, event });
    },
    [nodePositions, ghostingIds, snapToGridSize, onDragNodeTransitionEnd]
  );

  const handlePanCanvasStart = useCallback(
    (input: OnPanCanvasInput): void => {
      onPanCanvasStart(input);
    },
    [onPanCanvasStart]
  );

  const handlePanCanvas = useCallback(
    (input: OnPanCanvasInput): void => {
      onPanCanvas(input);
    },
    [onPanCanvas]
  );

  const handlePanCanvasStop = useCallback(
    (input: OnPanCanvasInput): void => {
      onPanCanvasStop(input);
    },
    [onPanCanvasStop]
  );

  const handleZoomCanvasStart = useCallback(
    (input: OnZoomCanvasInput): void => {
      onZoomCanvasStart(input);
    },
    [onZoomCanvasStart]
  );

  const handleZoomCanvas = useCallback(
    (input: OnZoomCanvasInput): void => {
      setScale(input.scale);
      onZoomCanvas(input);
    },
    [onZoomCanvas]
  );

  const handleZoomCanvasStop = useCallback(
    (input: OnZoomCanvasInput): void => {
      setScale(input.scale);
      onZoomCanvasStop(input);
    },
    [onZoomCanvasStop]
  );

  const handleNodeRef = useCallback(
    (id: string, instance: HTMLDivElement | null) => {
      nodeRefs.current[id] = instance;
    },
    []
  );
  const linkArray = useMemo(() => Object.values(links), [links]);

  useEffect(() => {
    setLocalChart(chart);
    nodePositions.current = getInitialNodePositions(chart.nodes);
    forceUpdate({});
  }, [chart, chart.nodes]);

  useEffect(() => {
    const updateX = (value: number): void => {
      if (draggingId) {
        nodePositions.current[draggingId].x = value;
      }
    };
    const updateY = (value: number): void => {
      if (draggingId) {
        nodePositions.current[draggingId].y = value;
      }
    };

    if (draggingId) {
      const unsubscribeX = draggingX.onChange(updateX);
      const unsubscribeY = draggingY.onChange(updateY);

      return (): void => {
        unsubscribeX();
        unsubscribeY();
      };
    }
    return undefined;
  }, [draggingId, draggingX, draggingY]);

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
        allowPan={allowPan}
        scrollParent={scrollParent}
        onChartAreaRef={onChartAreaRef}
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
                    draggingX={draggingX}
                    draggingY={draggingY}
                    draggingId={draggingId}
                    ghostingIds={ghostingIds}
                    nodePositions={nodePositions.current}
                    nodeOffsets={nodeOffsets.current}
                    nodeSizes={nodeSizes.current}
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
                draggingX,
                draggingY,
                draggingOriginX,
                draggingOriginY,
                boundsSelector,
                ghostingIds,
                nodePositions: nodePositions.current,
                nodeOffsets: nodeOffsets.current,
                nodeSizes: nodeSizes.current,
                pressDelay,
                onDragHandleTrigger,
                onTapNodeStart: handleTapNodeStart,
                onTapNode: handleTapNode,
                onTapNodeCancel: handleTapNodeCancel,
                onPointerDownNode: handlePointerDownNode,
                onPointerUpNode: handlePointerUpNode,
                onDragNodeForced: handleDragNodeForced,
                onDragNodeStart: handleDragNodeStart,
                onDragNode: handleDragNode,
                onDragNodeEnd: handleDragNodeEnd,
                onDragNodeTransitionEnd: handleDragNodeTransitionEnd,
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
