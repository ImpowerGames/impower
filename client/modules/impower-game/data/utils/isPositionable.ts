import { Positionable } from "../interfaces/positionable";

export const isPositionable = (obj: unknown): obj is Positionable => {
  if (!obj) {
    return false;
  }
  const positionable = obj as Positionable;
  return positionable.nodePosition !== undefined;
};
