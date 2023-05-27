import { Color } from "../types/interfaces/color";

const isColor = (obj: unknown): obj is Color => {
  if (!obj) {
    return false;
  }
  const color = obj as Color;
  return (
    color.h !== undefined &&
    color.s !== undefined &&
    color.l !== undefined &&
    color.a !== undefined
  );
};

export default isColor;
