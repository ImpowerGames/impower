import { PathCommand } from "../types/Path";
import { bezier } from "./bezier";
import { interpolatePath } from "./interpolatePath";

export const getTweenedPathCommands = (
  fractionalFrameIndex: number,
  keySplines: [number, number, number, number][],
  values: PathCommand[][]
): PathCommand[] => {
  const frameIndex = Math.floor(fractionalFrameIndex);
  const tweenValue = fractionalFrameIndex - frameIndex;
  const frame = values[frameIndex];
  if (!frame) {
    return [];
  }
  if (tweenValue === 0) {
    return frame;
  }
  const keySpline = keySplines[frameIndex];
  const nextFrame = values[frameIndex + 1];
  if (!nextFrame || !keySpline) {
    return frame;
  }

  return interpolatePath(tweenValue, frame, nextFrame, bezier(...keySpline));
};
