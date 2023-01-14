import { Character, Inflection } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { SOUND_VALIDATION } from "./SOUND_VALIDATION";

const STRESS_VALIDATION: RecursiveValidation<Inflection> = {
  phraseSlope: [0.01, 0, 1],
  neutralLevel: [1, 0, 10],
  finalContour: [1, 0, 10],
  emphasisContour: [1, 0, 10],
  finalDilation: [1, 1, 10],
  pitchRamp: [0.01, -1, 1],
  pitchAccel: [0.01, -1, 1],
  pitchJerk: [0.01, -1, 1],
  volumeRamp: [0.01, -1, 1],
};

export const CHARACTER_VALIDATION: RecursiveValidation<Character> = {
  intonation: {
    phrasePitchIncrement: [0.01, 0, 1],
    phrasePitchMaxOffset: [0.01, 0, 1],
    downdriftIncrement: [0.001, 0, 0.1],
    syllableFluctuation: [0.01, 0, 1],
    stressLevelSemitones: [0.01, 0, 1],
    liltQuestion: STRESS_VALIDATION,
    liltExclamation: STRESS_VALIDATION,
    lilt: STRESS_VALIDATION,
    resolvedAnxiousQuestion: STRESS_VALIDATION,
    anxiousQuestion: STRESS_VALIDATION,
    resolvedQuestion: STRESS_VALIDATION,
    question: STRESS_VALIDATION,
    exclamation: STRESS_VALIDATION,
    comma: STRESS_VALIDATION,
    partial: STRESS_VALIDATION,
    anxious: STRESS_VALIDATION,
    statement: STRESS_VALIDATION,
  },
  prosody: {
    maxSyllableLength: [1, 1, 5],
  },
  voiceSound: SOUND_VALIDATION,
};
