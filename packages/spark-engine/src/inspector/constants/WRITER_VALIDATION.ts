import { Writer } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";

export const WRITER_VALIDATION: RecursiveValidation<Writer> = {
  letter_pause: [0.01, 0, 1],
  phrase_pause_scale: [0.5, 1, 10],
  fade_duration: [0.01, 0, 1],
};
