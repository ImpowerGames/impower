import type { TextInstruction } from "../../../core/types/Instruction";
import type { ImageState } from "./ImageState";

export interface CastLine {
  key: string;
  cleared: number;
  index: number;
}

export interface CastEntry {
  id: number;
  speaker: string;
  template: number;
  variant?: string;
  image?: Record<string, ImageState[]>;
  text?: Record<string, TextInstruction[]>;
  lines?: Record<string, CastLine[]>;
}

export interface CastState {
  entries: CastEntry[];
  next: number;
  latest?: string;
  variants?: Record<string, string>;
}
