import { interpolatePath } from "./interpolatePath";

export const getTweenedValue = (
  fractionalFrameIndex: number,
  keySplines: [number, number, number, number][],
  values: string[]
): string => {
  const frameIndex = Math.floor(fractionalFrameIndex);
  const tweenValue = fractionalFrameIndex - frameIndex;
  const frame = values[frameIndex];
  if (tweenValue === 0) {
    return frame;
  }
  const keySpline = keySplines[frameIndex];
  const nextFrame = values[frameIndex + 1];

  const interpolator = interpolatePath(frame, nextFrame, keySpline);

  return interpolator(tweenValue);
};
