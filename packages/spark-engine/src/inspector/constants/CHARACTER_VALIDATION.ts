import { Character } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { SYNTH_VALIDATION } from "./SYNTH_VALIDATION";

const CONTOUR_VALIDATION = [1, 0, 10];

export const CHARACTER_VALIDATION: RecursiveValidation<Character> = {
  inflection: {
    liltQuestion: CONTOUR_VALIDATION,
    liltExclamation: CONTOUR_VALIDATION,
    lilt: CONTOUR_VALIDATION,
    resolvedAnxiousQuestion: CONTOUR_VALIDATION,
    anxiousQuestion: CONTOUR_VALIDATION,
    resolvedQuestion: CONTOUR_VALIDATION,
    question: CONTOUR_VALIDATION,
    exclamation: CONTOUR_VALIDATION,
    comma: CONTOUR_VALIDATION,
    partial: CONTOUR_VALIDATION,
    anxious: CONTOUR_VALIDATION,
    statement: CONTOUR_VALIDATION,
  },
  prosody: {},
  voiceSound: SYNTH_VALIDATION,
};
