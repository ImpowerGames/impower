import {
  DEFAULT_SOUND,
  RecursiveRandomization,
  RecursiveValidation,
  SOUND_RANDOMIZATIONS,
  SOUND_VALIDATION,
} from "../../../../spark-engine";
import { SparkStructType } from "../../../../sparkdown";

export const sparkSpecifications: Record<
  SparkStructType,
  {
    default: unknown;
    validation: RecursiveValidation;
    randomizations: Record<string, RecursiveRandomization>;
  }
> = {
  map: undefined,
  entity: undefined,
  character: undefined,
  ui: undefined,
  style: undefined,
  camera: undefined,
  animation: undefined,
  writer: undefined,
  sound: {
    default: DEFAULT_SOUND,
    validation: SOUND_VALIDATION,
    randomizations: SOUND_RANDOMIZATIONS,
  },
};
