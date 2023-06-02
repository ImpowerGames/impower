import { Vector2, Side, Port } from "../types/generics";
import { isCurvedLinePossible } from "./line";

export const getPortPositions = (
  position: Vector2,
  size: Vector2,
  sideOffsets: { [side in Side]: number },
  portOffset: number
): { [side in Side]: Vector2 } => {
  const verticalX =
    position.x +
    portOffset +
    sideOffsets.Left +
    (size.x - sideOffsets.Left - sideOffsets.Right) * 0.5;
  const horizontalY =
    position.y +
    portOffset +
    sideOffsets.Top +
    (size.y - sideOffsets.Top - sideOffsets.Bottom) * 0.5;

  return {
    Top: {
      x: verticalX,
      y: position.y + sideOffsets.Top,
    },
    Right: {
      x: position.x + size.x - sideOffsets.Right,
      y: horizontalY,
    },
    Bottom: {
      x: verticalX,
      y: position.y + size.y - sideOffsets.Bottom,
    },
    Left: {
      x: position.x + sideOffsets.Left,
      y: horizontalY,
    },
  };
};

export const getClosestSides = (
  sideOffsets: { [side in Side]: number },
  portOffsets: { [port in Port]: number },
  startPosition: Vector2,
  endPosition: Vector2,
  startSize: Vector2,
  endSize: Vector2,
  minCurve: number
): {
  start: { side: Side; position: Vector2 };
  end: { side: Side; position: Vector2 };
} => {
  const newSideOffsets = sideOffsets;
  const newPortOffsets = portOffsets;
  const newStartPosition = startPosition;
  const newStartSize = startSize;
  const newEndPosition = endPosition;
  const newEndSize = endSize;

  const pointsA = getPortPositions(
    newStartPosition,
    newStartSize,
    newSideOffsets,
    newPortOffsets[Port.Output]
  );
  const pointsB = getPortPositions(
    newEndPosition,
    newEndSize,
    newSideOffsets,
    newPortOffsets[Port.Input]
  );

  let startSide = Side.Bottom;
  let endSide = Side.Bottom;
  let startPos = pointsA[startSide];
  let endPos = pointsB[endSide];
  let minDist = Number.MAX_VALUE;

  Object.keys(pointsA).forEach((sideA) => {
    Object.keys(pointsB).forEach((sideB) => {
      const a = pointsA[sideA as Side];
      const b = pointsB[sideB as Side];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (
        distance <= minDist &&
        isCurvedLinePossible(a, b, sideA as Side, sideB as Side, minCurve)
      ) {
        startSide = sideA as Side;
        endSide = sideB as Side;
        startPos = a;
        endPos = b;
        minDist = distance;
      }
    });
  });

  return {
    start: { side: startSide, position: startPos },
    end: { side: endSide, position: endPos },
  };
};
