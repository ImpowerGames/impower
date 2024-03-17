import { AudioEvent } from "../../../core/types/SequenceEvent";

export interface AudioUpdate extends AudioEvent {
  control: string;
  channel: string;
  id: string;
  name?: string;
  syncedTo?: string;
  cues?: number[];
  level?: number;
}
