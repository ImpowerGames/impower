import { MidiEvent } from "./MidiEvent";

export interface Midi {
  /**
   * 0 = file has header chunk followed by one track chunk.
   * 1 = file has header chunk followed by one or more track chunks (vertically one dimensional form, i.e. a collection of tracks)
   * 2 = file has header chunk followed by one or more track chunks (horizontally one dimensional form)
   */
  format: number;
  /**
   * ticks per quarter-note
   */
  tpq: number;
  /**
   * The track chunks
   */
  tracks: MidiEvent[][];

  src?: string;
}
