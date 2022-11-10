import { OscillatorType } from "./OscillatorType";

export interface Wave extends Record<string, string | number | undefined> {
  w?: OscillatorType | "w9999" | "n0" | "n1";
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  f?: number;
  g?: number;
  h?: number;
  k?: number;
  p?: number;
  q?: number;
  r?: number;
  s?: number;
  t?: number;
  v?: number;
}
