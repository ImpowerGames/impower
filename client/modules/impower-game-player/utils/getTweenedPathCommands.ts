import { interpolatePathCommands, PathCommand } from "./interpolatePath";

export const getTweenedPathCommands = (
  fractionalFrameIndex: number,
  keySplines: [number, number, number, number][],
  values: PathCommand[][]
): PathCommand[] => {
  const frameIndex = Math.floor(fractionalFrameIndex);
  const tweenValue = fractionalFrameIndex - frameIndex;
  const frame = values[frameIndex];
  if (tweenValue === 0) {
    return frame;
  }
  const keySpline = keySplines[frameIndex];
  const nextFrame = values[frameIndex + 1];

  const interpolator = interpolatePathCommands(frame, nextFrame, keySpline);

  return interpolator(tweenValue);
};
