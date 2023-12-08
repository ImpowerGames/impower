import { WaveformContext } from "../types/WaveformContext";
import { clamp } from "./clamp";
import { getCurrentScale } from "./getCurrentScale";
import { getSampleIndex } from "./getSampleIndex";
import { panWaveform } from "./panWaveform";

export const zoomWaveform = (
  context: WaveformContext,
  newZoomOffset: number,
  xFocus: number,
  width: number,
  bufferLength: number
): void => {
  const xOffset = context.xOffset;
  const maxZoomOffset = context.maxZoomOffset;

  const prevXOffset = xOffset;
  const prevWidth = width * getCurrentScale(context);
  const prevSampleIndex = getSampleIndex(
    xFocus,
    xOffset,
    prevWidth,
    bufferLength
  );
  context.zoomOffset = clamp(newZoomOffset, 0, maxZoomOffset);
  const newWidth = width * getCurrentScale(context);
  const newSampleIndex = getSampleIndex(
    xFocus,
    xOffset,
    newWidth,
    bufferLength
  );
  const pixelsPerSample = newWidth / bufferLength;
  const sampleOffset = newSampleIndex - prevSampleIndex;
  const deltaX = sampleOffset * pixelsPerSample;
  panWaveform(context, prevXOffset + deltaX);
};
