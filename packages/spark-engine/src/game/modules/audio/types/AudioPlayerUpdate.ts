import { AudioInstruction } from "../../../core/types/Instruction";

export interface AudioPlayerUpdate extends AudioInstruction {
  control?: string;
  channel?: string;
  mixer?: string;
  key: string;
  name?: string;
  syncedTo?: string;
  cues?: number[];
}
