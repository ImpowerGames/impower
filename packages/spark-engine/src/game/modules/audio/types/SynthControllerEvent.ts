export interface SynthControllerEvent {
  /** time in seconds from start */
  time: number;
  /** duration in seconds */
  duration: number;
  /** type of event (0-127) */
  type: number;
  /** value (typically a normalized value between 0 and 1) */
  value: number;
}
