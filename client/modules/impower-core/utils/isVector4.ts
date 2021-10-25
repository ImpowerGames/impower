import { Vector4 } from "../types/interfaces/vector";

const isVector4 = (obj: unknown): obj is Vector4 => {
  if (!obj) {
    return false;
  }
  const color = obj as Vector4;
  return (
    color.x !== undefined &&
    color.y !== undefined &&
    color.z !== undefined &&
    color.w !== undefined
  );
};

export default isVector4;
