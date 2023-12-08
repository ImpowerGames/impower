import { WaveformContext } from "../types/WaveformContext";

export const getCurrentZoomLevel = (context: WaveformContext): number => {
  return context.zoomOffset / context.maxZoomOffset;
};
