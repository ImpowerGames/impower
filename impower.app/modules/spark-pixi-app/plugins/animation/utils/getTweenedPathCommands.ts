import { PathCommand } from "../../path/types/Path";
import { bezier } from "../../path/utils/bezier";
import { interpolatePath } from "../../path/utils/interpolatePath";

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
