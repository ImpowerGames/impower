import React, { useMemo } from "react";
import { Vector2, Side } from "../../types/generics";
import {
  getCurvedLineSvgPoints,
  getLineOffsetPosition,
  getSelfLineSvgPoints,
} from "../../utils/line";
import { getArrowSvgPoints } from "../../utils/arrow";

export interface LinkDefaultProps {
  fromNodeId: string;
  toNodeId: string;
  startPosition: Vector2;
  endPosition: Vector2;
  startSide: Side;
  endSide: Side;
  linkColor: string;
  lineStrokeWidth: number;
  arrowSize: number;
  arrowStrokeWidth: number;
}

export const LinkDefault = React.memo(
  (props: LinkDefaultProps): JSX.Element => {
    const {
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
    } = props;

    const lineStartPosition = getLineOffsetPosition(
      startSide,
      startPosition,
      arrowSize,
      arrowStrokeWidth
    );

    const lineEndPosition = getLineOffsetPosition(
      endSide,
      endPosition,
      arrowSize,
      arrowStrokeWidth
    );

    const points = useMemo(
      () =>
        fromNodeId === toNodeId
          ? getSelfLineSvgPoints(lineStartPosition, lineEndPosition, 16)
          : getCurvedLineSvgPoints(
              lineStartPosition,
              lineEndPosition,
              startSide,
              endSide
            ),
      [
        fromNodeId,
        toNodeId,
        lineStartPosition,
        lineEndPosition,
        startSide,
        endSide,
      ]
    );

    const endArrowPoints = useMemo(
      () => getArrowSvgPoints(endPosition, endSide, arrowSize),
      [endPosition, endSide, arrowSize]
    );

    return (
      <svg
        className="Link"
        style={{
          overflow: "visible",
          position: "absolute",
          left: 0,
          right: 0,
        }}
      >
        <path
          className="Line"
          d={points}
          stroke={linkColor}
          strokeWidth={lineStrokeWidth}
          fill="none"
        />
        <path
          className="Line"
          d={`M ${startPosition.x} ${startPosition.y} L ${lineStartPosition.x} ${lineStartPosition.y}`}
          stroke={linkColor}
          strokeWidth={lineStrokeWidth}
          fill="none"
        />
        <polygon
          className="Arrow"
          fill={linkColor}
          stroke={linkColor}
          points={endArrowPoints}
          strokeWidth={arrowStrokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
);
