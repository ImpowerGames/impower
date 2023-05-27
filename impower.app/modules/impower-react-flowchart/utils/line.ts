import { Vector2, Side, BezierCurve } from "../types/generics";

export const getLineOffsetPosition = (
  side: Side,
  position: Vector2,
  arrowSize: number,
  arrowStrokeWidth: number
): Vector2 => {
  const { x, y } = position;
  const offset = arrowSize + arrowStrokeWidth * 0.5;
  switch (side) {
    case Side.Top:
      return { x, y: y - offset };
    case Side.Right:
      return { x: x + offset, y };
    case Side.Bottom:
      return { x, y: y + offset };
    case Side.Left:
      return { x: x - offset, y };
    default:
      return { x, y };
  }
};

export const getBezierCurve = (
  startPos: Vector2,
  endPos: Vector2,
  startSide: Side,
  endSide: Side
): BezierCurve => {
  if (
    (startSide === Side.Top && endSide === Side.Bottom) ||
    (startSide === Side.Bottom && endSide === Side.Top)
  ) {
    return {
      startPoint: startPos,
      startControlPoint: { x: startPos.x, y: endPos.y },
      endControlPoint: { x: endPos.x, y: startPos.y },
      endPoint: endPos,
    };
  }
  if (
    (startSide === Side.Left && endSide === Side.Right) ||
    (startSide === Side.Right && endSide === Side.Left)
  ) {
    return {
      startPoint: startPos,
      startControlPoint: { x: endPos.x, y: startPos.y },
      endControlPoint: { x: startPos.x, y: endPos.y },
      endPoint: endPos,
    };
  }
  if (
    (startSide === Side.Bottom || startSide === Side.Top) &&
    (endSide === Side.Right || endSide === Side.Left)
  ) {
    return {
      startPoint: startPos,
      startControlPoint: { x: startPos.x, y: endPos.y },
      endControlPoint: { x: startPos.x, y: endPos.y },
      endPoint: endPos,
    };
  }
  if (
    (startSide === Side.Left || startSide === Side.Right) &&
    (endSide === Side.Top || endSide === Side.Bottom)
  ) {
    return {
      startPoint: startPos,
      startControlPoint: { x: endPos.x, y: startPos.y },
      endControlPoint: { x: endPos.x, y: startPos.y },
      endPoint: endPos,
    };
  }
  return {
    startPoint: startPos,
    startControlPoint: { x: startPos.x, y: endPos.y },
    endControlPoint: { x: endPos.x, y: startPos.y },
    endPoint: endPos,
  };
};

export const isCurvedLinePossible = (
  startPos: Vector2,
  endPos: Vector2,
  startSide: Side,
  endSide: Side,
  minCurve: number
): boolean => {
  const curve = getBezierCurve(startPos, endPos, startSide, endSide);
  const { startControlPoint, startPoint, endControlPoint, endPoint } = curve;
  const isYStartCurveValid =
    Math.abs(startControlPoint.y - startPoint.y) >= minCurve;
  const isXStartCurveValid =
    Math.abs(startControlPoint.x - startPoint.x) >= minCurve;
  const isYEndCurveValid = Math.abs(endControlPoint.y - endPoint.y) >= minCurve;
  const isXEndCurveValid = Math.abs(endControlPoint.x - endPoint.x) >= minCurve;

  if (
    startSide === Side.Top &&
    (startControlPoint.y >= startPoint.y || !isYStartCurveValid)
  ) {
    return false;
  }
  if (
    startSide === Side.Bottom &&
    (startControlPoint.y <= startPoint.y || !isYStartCurveValid)
  ) {
    return false;
  }
  if (
    startSide === Side.Left &&
    (startControlPoint.x >= startPoint.x || !isXStartCurveValid)
  ) {
    return false;
  }
  if (
    startSide === Side.Right &&
    (startControlPoint.x <= startPoint.x || !isXStartCurveValid)
  ) {
    return false;
  }

  if (
    endSide === Side.Top &&
    (endControlPoint.y >= endPoint.y || !isYEndCurveValid)
  ) {
    return false;
  }
  if (
    endSide === Side.Bottom &&
    (endControlPoint.y <= endPoint.y || !isYEndCurveValid)
  ) {
    return false;
  }
  if (
    endSide === Side.Left &&
    (endControlPoint.x >= endPoint.x || !isXEndCurveValid)
  ) {
    return false;
  }
  if (
    endSide === Side.Right &&
    (endControlPoint.x <= endPoint.x || !isXEndCurveValid)
  ) {
    return false;
  }

  return true;
};

export const getCurvedLineSvgPoints = (
  startPos: Vector2,
  endPos: Vector2,
  startSide: Side,
  endSide: Side
): string => {
  const curve = getBezierCurve(startPos, endPos, startSide, endSide);
  const { startPoint, startControlPoint, endControlPoint, endPoint } = curve;
  return `M${startPoint.x},${startPoint.y} C ${startControlPoint.x},${startControlPoint.y} ${endControlPoint.x},${endControlPoint.y} ${endPoint.x},${endPoint.y}`;
};

export const getSelfLineSvgPoints = (
  startPos: Vector2,
  endPos: Vector2,
  yOffset: number
): string => {
  return `M${startPos.x},${startPos.y} C ${startPos.x},${
    startPos.y + yOffset
  } ${endPos.x},${endPos.y + yOffset} ${endPos.x},${endPos.y}`;
};
