import React from "react";
import { defaultFlowchartConfig, FlowChartConfig } from "../../types/config";
import { Side, Vector2 } from "../../types/generics";
import { getClosestSides } from "../../utils/sides";
import { LinkDefault, LinkDefaultProps } from "./Link.default";

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
  fromPosition: Vector2;
  toPosition: Vector2;
  fromSize: Vector2;
  toSize: Vector2;
  selectedIds: string[];
  children?: (props: LinkDefaultProps) => JSX.Element | null;
}

export const LinkWrapper = React.memo(
  (props: LinkWrapperProps): JSX.Element => {
    const {
      config = defaultFlowchartConfig,
      fromNodeId,
      toNodeId,
      fromPosition,
      toPosition,
      fromSize,
      toSize,
      selectedIds,
      children = LinkDefault,
    } = props;

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

    const startX = fromPosition.x;
    const startY = fromPosition.y;
    const endX = toPosition.x;
    const endY = toPosition.y;

    const selected =
      selectedIds?.includes(fromNodeId) || selectedIds?.includes(toNodeId);

    const { startPosition, endPosition, startSide, endSide } = getLinkPorts(
      sideOffsets,
      portOffsets,
      { x: startX, y: startY },
      { x: endX, y: endY },
      fromSize,
      toSize,
      minCurve
    );

    return (
      <div
        style={{
          position: "absolute",
          zIndex: selected ? 10000 : 0,
        }}
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
      </div>
    );
  }
);
