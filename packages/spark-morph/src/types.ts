export type Point = [number, number];

export interface Cubic {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

export interface Subpath {
  segments: Cubic[];
  closed: boolean;
}

export type MorphMethod = "match" | "bend" | "trace";

export type MorphFailureCode =
  | "empty-geometry"
  | "subpath-count"
  | "not-closed"
  | "node-count"
  | "tips-not-found"
  | "self-intersection"
  | "thickness";

export interface MorphFailure {
  code: MorphFailureCode;
  message: string;
  subpath?: number;
  progress?: number[];
}

export interface SubpathTrack {
  from: Cubic[];
  to: Cubic[];
  frame(progress: number): Cubic[];
}

export interface SubpathMorph {
  method: MorphMethod | "still" | "scale";
  tracks: SubpathTrack[];
  from: Subpath[];
  to: Subpath[];
  frame(progress: number): Subpath[];
}

export type MorphResult =
  | { ok: true; morph: SubpathMorph }
  | { ok: false; failure: MorphFailure };
