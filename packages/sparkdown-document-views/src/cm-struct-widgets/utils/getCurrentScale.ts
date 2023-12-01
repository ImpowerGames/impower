import { lerp } from "../../../../spark-engine/src/game/core/utils/lerp";
import { WaveformContext } from "../types/WaveformContext";
import { getCurrentZoomLevel } from "./getCurrentZoomLevel";

export const getCurrentScale = (context: WaveformContext): number => {
  return lerp(getCurrentZoomLevel(context), 1, context.maxScale);
};
