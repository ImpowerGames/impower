import { Tone } from "./Tone";
export interface MidiTrack {
  /** Channel number (10 & 17 are reserved for percussion) */
  channel?: number;

  /** Instrument number (1-128) */
  instrument?: number;

  /** sequence of notes */
  notes: Tone[];

  /** midi control changes */
  controlChanges?: Record<
    number,
    {
      /** the cc number */
      number?: number;
      /** time in seconds */
      time?: number;
      /** normalized 0-1 */
      value?: number;
    }[]
  >;
}
