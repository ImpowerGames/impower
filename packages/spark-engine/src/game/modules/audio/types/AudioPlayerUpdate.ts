import { AudioEvent } from "../../../core/types/SequenceEvent";

export interface AudioPlayerUpdate extends AudioEvent {
  control?: string;
  channel?: string;
  mixer?: string;
  key: string;
  name?: string;
  syncedTo?: string;
  cues?: number[];
}
