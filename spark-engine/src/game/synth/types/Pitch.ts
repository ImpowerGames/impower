export type Flat = "b";
export type Sharp = "#";
export type Accidental = Flat | Sharp;
export type Octave = number;
export type Note = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type ImpossibleNote = `${"E" | "B"}${Sharp}` | `${"F" | "C"}${Flat}`;
export type NoteWithAccidental = Exclude<
  `${Note}${Accidental}`,
  ImpossibleNote
>;
export type Pitch = `${NoteWithAccidental | Note}${Octave | ""}`;
