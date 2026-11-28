import type { TextInstruction } from "../../../core/types/Instruction";

export interface StreamEntry {
  template: number;
  text: Record<string, TextInstruction[]>;
  variant?: string;
  speaker?: string;
  shown?: Record<string, number>;
}

export interface StreamState {
  entries: StreamEntry[];
  current: number;
  reserved?: number;
  cleared?: number;
  key?: string;
  beat?: number;
  absorbed?: StreamEntry[];
  styles?: Record<number, Record<string, Record<string, string>>>;
}

export interface StreamRunState {
  lines: number;
  ends?: true;
}
