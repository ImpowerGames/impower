export type Direction = "+" | "-";

export type Semitones = number;

export type Curve = `${Direction}${Semitones}` | "0";

export type ContourType =
  | `${Curve} ${Curve}`
  | `${Curve} ${Curve} ${Curve}`
  | `${Curve} ${Curve} ${Curve} ${Curve}`
  | `${Curve} ${Curve} ${Curve} ${Curve} ${Curve}`
  | `${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve}`
  | `${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve}`
  | `${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve}`
  | `${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve}`
  | `${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve} ${Curve}`;
