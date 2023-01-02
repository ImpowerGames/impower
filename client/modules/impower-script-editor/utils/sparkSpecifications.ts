import {
  DEFAULT_SOUND,
  RecursiveRandomization,
  RecursiveValidation,
  SOUND_RANDOMIZATIONS,
  SOUND_VALIDATION,
} from "../../../../spark-engine";
import {
  DEFAULT_CHARACTER,
  DEFAULT_WRITER,
} from "../../../../spark-engine/src/game/writer";
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
  ui: undefined,
  style: undefined,
  camera: undefined,
  animation: undefined,
  character: {
    default: DEFAULT_CHARACTER,
    validation: undefined,
    randomizations: undefined,
  },
  writer: {
    default: DEFAULT_WRITER,
    validation: undefined,
    randomizations: undefined,
  },
  sound: {
    default: DEFAULT_SOUND,
    validation: SOUND_VALIDATION,
    randomizations: SOUND_RANDOMIZATIONS,
  },
};
