import { Vector2 } from "../types/generics";

export const getSnappedValue = (value: number, snapSize: number): number => {
  return Math.round(value / snapSize) * snapSize;
};

export const getSnappedVector = (
  position: Vector2,
  gridSize: number,
  size: Vector2,
  chartSize: Vector2
): Vector2 => {
  return {
    x: Math.min(
      chartSize.x - size.x,
      Math.max(0, getSnappedValue(position.x, gridSize))
    ),
    y: Math.min(
      chartSize.y - size.y,
      Math.max(0, getSnappedValue(position.y, gridSize))
    ),
  };
};
