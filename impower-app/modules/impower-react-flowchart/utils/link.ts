import { Vector2 } from "../types/generics";

export const getLinkPosition = (
  nodePosition: Vector2,
  portOffset: Vector2
): Vector2 => {
  return {
    x: nodePosition.x + portOffset.x,
    y: nodePosition.y + portOffset.y,
  };
};
