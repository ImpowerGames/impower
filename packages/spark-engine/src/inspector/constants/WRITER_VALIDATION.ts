import { Writer } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { SYNTH_VALIDATION } from "./SYNTH_VALIDATION";

export const WRITER_VALIDATION: RecursiveValidation<Writer> = {
  letter_delay: [0.01, 0, 1],
  phrase_pause_scale: [0.5, 1, 10],
  fade_duration: [0.01, 0, 1],
  synth: SYNTH_VALIDATION,
};
