export interface MidiTrack {
  /** sequence of notes */
  notes: {
    /** note name, e.g. "C4" */
    note?: string;
    /** time in seconds */
    time?: number;
    /** duration in seconds */
    duration?: number;
    /** normalized 0-1 velocity */
    velocity?: number;
  }[];

  /** Instrument number (1-128) */
  instrument?: number;

  /** Channel number (10 & 17 are reserved for percussion) */
  channel?: number;

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
