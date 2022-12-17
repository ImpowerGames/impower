import {
  RecursiveValidation,
  SOUND_VALIDATION,
} from "../../../../spark-engine";
import { SparkStructType } from "../../../../sparkdown/src/types/SparkStructType";

export const sparkValidations: Record<
  SparkStructType,
  RecursiveValidation<unknown>
> = {
  map: undefined,
  entity: undefined,
  character: undefined,
  ui: undefined,
  style: undefined,
  camera: undefined,
  animation: undefined,
  display: undefined,
  sound: SOUND_VALIDATION,
  typewriter: undefined,
  preset: undefined,
};
