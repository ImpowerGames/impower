import type { TextInstruction } from "../../../core/types/Instruction";

export interface StreamEntry {
  id?: number;
  template: number;
  text: Record<string, TextInstruction[]>;
  shown?: Record<string, number>;
  carried?: true;
}

export interface StreamRestart {
  carried: number;
  closed?: true;
}

export interface StreamState {
  entries: StreamEntry[];
  current: number;
  next?: number;
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
