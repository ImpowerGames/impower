import type { TextInstruction, WithInstruction } from "../../../core/types/Instruction";
import type { ImageState } from "./ImageState";

export interface CastLine {
  key: string;
  index: number;
  entry?: number;
  cleared?: number;
  length?: number;
  hash?: string;
}

export interface CastEntry {
  id: number;
  speaker: string;
  variant?: string;
  image?: Record<string, ImageState[]>;
  text?: Record<string, TextInstruction[]>;
  lines?: Record<string, CastLine[]>;
  emptied?: string[];
}

export interface CastState {
  entries: CastEntry[];
  next: number;
  latest?: string;
  variants?: Record<string, string>;
  framings?: Record<string, Record<string, string>>;
  poses?: Record<string, Record<string, WithInstruction[]>>;
  beat?: number;
  key?: string;
}
