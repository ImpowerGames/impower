import {
    GRAPHIC_RANDOMIZATIONS,
    RecursiveRandomization,
    SYNTH_RANDOMIZATIONS,
} from "../../../../spark-engine/src/inspector";

export const getSparkRandomizations = (
  type: string,
  _objectMap?: {
    [type: string]: Record<string, object>;
  }
): Record<string, RecursiveRandomization> | undefined => {
  if (type === "synth") {
    return SYNTH_RANDOMIZATIONS;
  }
  if (type === "graphic") {
    return GRAPHIC_RANDOMIZATIONS;
  }
  return undefined;
};
