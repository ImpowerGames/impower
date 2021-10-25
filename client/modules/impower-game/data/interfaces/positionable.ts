import { Vector2 } from "../../../impower-core";

export interface Positionable {
  nodePosition: Vector2;
}

export const isPositionable = (obj: unknown): obj is Positionable => {
  if (!obj) {
    return false;
  }
  const positionable = obj as Positionable;
  return positionable.nodePosition !== undefined;
};
