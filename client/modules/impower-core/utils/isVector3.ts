import { Vector3 } from "../types/interfaces/vector";

const isVector3 = (obj: unknown): obj is Vector3 => {
  if (!obj) {
    return false;
  }
  const color = obj as Vector3;
  return (
    color.x !== undefined && color.y !== undefined && color.z !== undefined
  );
};

export default isVector3;
