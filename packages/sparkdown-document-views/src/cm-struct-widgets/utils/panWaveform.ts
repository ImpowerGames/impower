import { WaveformContext } from "../types/WaveformContext";
import { clamp } from "./clamp";
import { getCurrentScale } from "./getCurrentScale";

export const panWaveform = (
  context: WaveformContext,
  newXOffset: number
): void => {
  const width = context.width;
  context.xOffset = clamp(
    newXOffset,
    width - width * getCurrentScale(context),
    0
  );
};
