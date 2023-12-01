import { Character } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { SYNTH_VALIDATION } from "./SYNTH_VALIDATION";

const CONTOUR_VALIDATION = [1, 0, 10];

export const CHARACTER_VALIDATION: RecursiveValidation<Character> = {
  inflection: {
    lilt_question: CONTOUR_VALIDATION,
    lilt_exclamation: CONTOUR_VALIDATION,
    lilt: CONTOUR_VALIDATION,
    resolved_anxious_question: CONTOUR_VALIDATION,
    anxious_question: CONTOUR_VALIDATION,
    resolved_question: CONTOUR_VALIDATION,
    question: CONTOUR_VALIDATION,
    exclamation: CONTOUR_VALIDATION,
    comma: CONTOUR_VALIDATION,
    partial: CONTOUR_VALIDATION,
    anxious: CONTOUR_VALIDATION,
    statement: CONTOUR_VALIDATION,
  },
  prosody: {},
  synth: SYNTH_VALIDATION,
};
