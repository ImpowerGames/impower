import { Vector2, Side } from "../types/generics";

const getArrowPointOffsets = (
  side: Side,
  size: number
): [Vector2, Vector2, Vector2] => {
  switch (side) {
    case Side.Top:
      return [
        { x: 0, y: 0 },
        { x: -size * 0.5, y: -size },
        { x: size * 0.5, y: -size },
      ];
    case Side.Bottom:
      return [
        { x: 0, y: 0 },
        { x: -size * 0.5, y: size },
        { x: size * 0.5, y: size },
      ];
    case Side.Left:
      return [
        { x: 0, y: 0 },
        { x: -size, y: -size * 0.5 },
        { x: -size, y: size * 0.5 },
      ];
    case Side.Right:
      return [
        { x: 0, y: 0 },
        { x: size, y: -size * 0.5 },
        { x: size, y: size * 0.5 },
      ];
    default:
      return [
        { x: 0, y: 0 },
        { x: -size * 0.5, y: -size },
        { x: size * 0.5, y: -size },
      ];
  }
};

export const getArrowPoints = (
  pos: Vector2,
  side: Side,
  size: number
): Vector2[] => {
  const pointOffsets = getArrowPointOffsets(side, size);
  const points: Vector2[] = [];
  pointOffsets.forEach((pointOffset) => {
    points.push({ x: pos.x + pointOffset.x, y: pos.y + pointOffset.y });
  });
  return points;
};

export const getArrowSvgPoints = (
  pos: Vector2,
  side: Side,
  size: number
): string => {
  const points = getArrowPoints(pos, side, size);
  const svgPoints: string[] = [];
  points.forEach((point) => {
    svgPoints.push(`${point.x} ${point.y}`);
  });

  return svgPoints.join(", ");
};
