import { FUNDAMENTAL_KEYS } from "../constants/FUNDAMENTAL_KEYS";
import { Note } from "../types/Note";

const A4 = 440.0; // An A-note in the fourth octave

const calculateStepsFromFrequency = (frequency: number) => {
  const steps = (12 * Math.log(frequency / A4)) / Math.log(2);
  return steps;
};

const calculateNoteBySteps = (steps: number): Note => {
  const o = steps / 12;
  const roundedO = steps < 0 ? Math.ceil(o) : Math.floor(o);
  const s = steps - roundedO * 12;
  const keyIndex = Math.floor(s) + 9;
  const pitch = FUNDAMENTAL_KEYS[keyIndex] || "A";
  const octave = roundedO + 4;
  return (pitch + octave) as Note;
};

export const convertHertzToPitchNote = (hertz: number): Note => {
  return calculateNoteBySteps(calculateStepsFromFrequency(hertz));
};
