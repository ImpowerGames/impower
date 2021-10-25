import { Vector2 } from "../types/generics";

export const getSnappedValue = (value: number, snapSize: number): number => {
  return Math.round(value / snapSize) * snapSize;
};

export const getSnappedVector = (
  position: Vector2,
  gridSize: number
): Vector2 => {
  return {
    x: getSnappedValue(position.x, gridSize),
    y: getSnappedValue(position.y, gridSize),
  };
};
