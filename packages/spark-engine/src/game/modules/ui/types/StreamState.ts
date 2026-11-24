import type { TextInstruction } from "../../../core/types/Instruction";

export interface StreamEntry {
  template: number;
  text: Record<string, TextInstruction[]>;
  shown?: Record<string, number>;
}

export interface StreamState {
  entries: StreamEntry[];
  current: number;
  key?: string;
  beat?: number;
  absorbed?: StreamEntry[];
}
