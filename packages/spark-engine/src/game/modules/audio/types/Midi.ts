import { MidiEvent } from "./MidiEvent";

export interface Midi {
  /**
   * 0 = file has one track containing all events.
   * 1 = file has one track containing meta events followed by one or more tracks containing channel events (vertically one dimensional form, i.e. a collection of tracks)
   * 2 = file has one track containing meta events followed by one or more tracks containing channel events (horizontally one dimensional form)
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
