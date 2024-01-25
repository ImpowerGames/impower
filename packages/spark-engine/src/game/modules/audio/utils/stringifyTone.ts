import { Tone } from "../types/Tone";

const round = (num: number) => Number(num.toFixed(10));

export const stringifyTone = (tone: Tone): string => {
  let str = "";
  if (tone.time != null) {
    str += "t";
    str += round(tone.time);
  }
  if (tone.duration != null) {
    str += "d";
    str += round(tone.duration);
  }
  if (tone.speed != null) {
    str += "s";
    str += round(tone.speed);
  }
  if (tone.velocity != null) {
    str += "v";
    str += round(tone.velocity);
  }
  if (tone.pitch != null) {
    str += "p";
    str += tone.pitch;
  }
  if (tone.bend != null) {
    str += "b";
    str += round(tone.bend);
  }
  if (tone.instrument != null) {
    str += "i";
    str += round(tone.instrument);
  }
  if (tone.note != null) {
    str += "n";
    str += round(tone.note);
  }
  if (tone.mono) {
    str += "m";
  }
  return str;
};
