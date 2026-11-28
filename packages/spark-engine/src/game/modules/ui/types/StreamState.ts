import type { TextInstruction } from "../../../core/types/Instruction";

export interface StreamEntry {
  template: number;
  text: Record<string, TextInstruction[]>;
  shown?: Record<string, number>;
  carried?: true;
}

export interface StreamRestart {
  carried: number;
}

export interface StreamState {
  entries: StreamEntry[];
  current: number;
  reserved?: number;
  cleared?: number;
  restart?: StreamRestart;
  key?: string;
  beat?: number;
  absorbed?: StreamEntry[];
  styles?: Record<number, Record<string, Record<string, string>>>;
}

export interface StreamRunState {
  lines: number;
  ends?: true;
}
