import type { TextInstruction } from "../../../core/types/Instruction";
import type { ImageState } from "./ImageState";

export interface CastLine {
  key: string;
  index: number;
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
  beat?: number;
  key?: string;
}
