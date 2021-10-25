import React, { useEffect, useState } from "react";
import { MotionValue, useMotionValue, motion } from "framer-motion";
import { LinkDefaultProps, LinkDefault } from "./Link.default";
import { Vector2, Side } from "../../types/generics";
import { FlowChartConfig, defaultFlowchartConfig } from "../../types/config";
import { getClosestSides } from "../../utils/sides";

const getLinkPorts = (
  sideOffsets: { Top: number; Bottom: number; Left: number; Right: number },
  portOffsets: { Input: number; Output: number },
  fromNodePosition: Vector2,
  toNodePosition: Vector2,
  fromNodeSize: Vector2,
  toNodeSize: Vector2,
  minCurve: number
): {
  startPosition: Vector2;
  endPosition: Vector2;
  startSide: Side;
  endSide: Side;
} => {
  const linkPortSides = getClosestSides(
    sideOffsets,
    portOffsets,
    fromNodePosition,
    toNodePosition,
    fromNodeSize,
    toNodeSize,
    minCurve
  );
  const startPosition = linkPortSides.start.position;
  const endPosition = linkPortSides.end.position;
  const startSide = linkPortSides.start.side;
  const endSide = linkPortSides.end.side;
  return { startPosition, endPosition, startSide, endSide };
};

export interface LinkWrapperProps {
  config?: FlowChartConfig;
  fromNodeId: string;
  toNodeId: string;
  draggingX: MotionValue<number>;
  draggingY: MotionValue<number>;
  draggingId: string | null;
  ghostingIds: string[];
  nodePositions: { [id: string]: Vector2 };
  nodeOffsets: { [id: string]: Vector2 };
  nodeSizes: { [id: string]: Vector2 };
  children?: (props: LinkDefaultProps) => JSX.Element | null;
}

export const LinkWrapper = (props: LinkWrapperProps): JSX.Element => {
  const {
    config = defaultFlowchartConfig,
    fromNodeId,
    toNodeId,
    draggingX,
    draggingY,
    draggingId,
    ghostingIds,
    nodePositions,
    nodeOffsets,
    nodeSizes,
    children = LinkDefault,
  } = props;

  const [, forceUpdate] = useState({});

  const dragAnimation = { zIndex: 10000 };
  const idleAnimation = { zIndex: 0, transition: { delay: 0.3 } };

  const linkColor =
    config?.linkConfig?.linkColor ||
    defaultFlowchartConfig.linkConfig.linkColor;
  const lineStrokeWidth =
    config?.linkConfig?.lineStrokeWidth ||
    defaultFlowchartConfig.linkConfig.lineStrokeWidth;
  const arrowSize =
    config?.linkConfig?.arrowSize ||
    defaultFlowchartConfig.linkConfig.arrowSize;
  const arrowStrokeWidth =
    config?.linkConfig?.arrowStrokeWidth ||
    defaultFlowchartConfig.linkConfig.arrowStrokeWidth;

  const sideOffsets =
    config?.portConfig?.sideOffsets ||
    defaultFlowchartConfig.portConfig.sideOffsets;
  const portOffsets =
    config?.portConfig?.portOffsets ||
    defaultFlowchartConfig.portConfig.portOffsets;
  const minCurve =
    config.linkConfig?.minCurve || defaultFlowchartConfig.linkConfig.minCurve;

  const startX = useMotionValue(nodePositions[fromNodeId].x);
  const startY = useMotionValue(nodePositions[fromNodeId].y);
  const endX = useMotionValue(nodePositions[toNodeId].x);
  const endY = useMotionValue(nodePositions[toNodeId].y);

  useEffect(() => {
    startX.set(nodePositions[fromNodeId].x);
    startY.set(nodePositions[fromNodeId].y);
    endX.set(nodePositions[toNodeId].x);
    endY.set(nodePositions[toNodeId].y);

    forceUpdate({});
  }, [nodePositions[fromNodeId], nodePositions[toNodeId]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const updateX = (value: number): void => {
      let shouldForceUpdate = false;
      if (draggingId === fromNodeId) {
        startX.set(value);
        shouldForceUpdate = true;
      } else if (ghostingIds.includes(fromNodeId)) {
        startX.set(value + nodeOffsets[fromNodeId].x);
        shouldForceUpdate = true;
      }
      if (draggingId === toNodeId) {
        endX.set(value);
        shouldForceUpdate = true;
      } else if (ghostingIds.includes(toNodeId)) {
        endX.set(value + nodeOffsets[toNodeId].x);
        shouldForceUpdate = true;
      }
      if (shouldForceUpdate) {
        forceUpdate({});
      }
    };
    const updateY = (value: number): void => {
      let shouldForceUpdate = false;
      if (draggingId === fromNodeId) {
        startY.set(value);
        shouldForceUpdate = true;
      } else if (ghostingIds.includes(fromNodeId)) {
        startY.set(value + nodeOffsets[fromNodeId].y);
        shouldForceUpdate = true;
      }
      if (draggingId === toNodeId) {
        endY.set(value);
        shouldForceUpdate = true;
      } else if (ghostingIds.includes(toNodeId)) {
        endY.set(value + nodeOffsets[toNodeId].y);
        shouldForceUpdate = true;
      }
      if (shouldForceUpdate) {
        forceUpdate({});
      }
    };
    if (
      draggingId === fromNodeId ||
      draggingId === toNodeId ||
      ghostingIds.includes(fromNodeId) ||
      ghostingIds.includes(toNodeId)
    ) {
      const unsubscribeX = draggingX.onChange(updateX);
      const unsubscribeY = draggingY.onChange(updateY);

      return (): void => {
        unsubscribeX();
        unsubscribeY();
      };
    }
    return undefined;
  }, [
    draggingId,
    ghostingIds,
    draggingX,
    draggingY,
    endX,
    endY,
    fromNodeId,
    nodeOffsets,
    startX,
    startY,
    toNodeId,
  ]);

  const { startPosition, endPosition, startSide, endSide } = getLinkPorts(
    sideOffsets,
    portOffsets,
    { x: startX.get(), y: startY.get() },
    { x: endX.get(), y: endY.get() },
    nodeSizes[fromNodeId],
    nodeSizes[toNodeId],
    minCurve
  );

  return (
    <motion.div
      animate={
        draggingId === fromNodeId ||
        draggingId === toNodeId ||
        ghostingIds.includes(fromNodeId) ||
        ghostingIds.includes(toNodeId)
          ? dragAnimation
          : idleAnimation
      }
      style={{ position: "absolute" }}
    >
      {children({
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
      })}
    </motion.div>
  );
};
