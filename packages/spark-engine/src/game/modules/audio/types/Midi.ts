import { type MidiEvent } from "./MidiEvent";

export interface Midi {
  format: number;
  tpq: number;
  tracks: MidiEvent[][];

  src?: string;
}
