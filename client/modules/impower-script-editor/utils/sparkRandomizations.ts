import {
  RecursiveRandomization,
  SOUND_RANDOMIZATION,
} from "../../../../spark-engine";
import { SparkStructType } from "../../../../sparkdown/src/types/SparkStructType";

export const sparkRandomizations: Record<
  SparkStructType,
  Record<string, RecursiveRandomization<unknown>>
> = {
  map: undefined,
  entity: undefined,
  character: undefined,
  ui: undefined,
  style: undefined,
  camera: undefined,
  animation: undefined,
  display: undefined,
  sound: SOUND_RANDOMIZATION,
  typewriter: undefined,
  preset: undefined,
};
