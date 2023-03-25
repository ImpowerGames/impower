export type Flat = "b";
export type Sharp = "#";
export type Octave = number;
export type Accidental = Flat | Sharp;
export type NaturalPitch = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type ImpossiblePitch = `${"E" | "B"}${Sharp}` | `${"F" | "C"}${Flat}`;
export type AccidentalPitch = Exclude<
  `${NaturalPitch}${Accidental}`,
  ImpossiblePitch
>;
export type Pitch = AccidentalPitch | NaturalPitch;
export type Note = `${Pitch}${Octave | ""}`;
