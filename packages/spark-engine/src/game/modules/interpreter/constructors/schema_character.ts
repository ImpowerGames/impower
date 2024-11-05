import { Character } from "../../..";
import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

const CONTOUR_VALIDATION = [1, 0, 10];

export const schema_character: Create<Schema<Character>> = () => ({
  $type: "character",
  $name: "$schema",
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
});
