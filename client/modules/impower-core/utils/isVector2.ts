import { Vector2 } from "../types/interfaces/vector";

const isVector2 = (obj: unknown): obj is Vector2 => {
  if (!obj) {
    return false;
  }
  const color = obj as Vector2;
  return color.x !== undefined && color.y !== undefined;
};

export default isVector2;
