import type { AudioPlayerUpdate } from "./AudioPlayerUpdate";

export interface UpdateAudioPlayersParams {
  channel: string;
  updates: AudioPlayerUpdate[];
  /** When the beat these updates belong to starts, on the shared clock
   *  (`sharedNow`, milliseconds). Each update's `after` counts from it. Absent
   *  for updates that start when the page handles them. */
  time?: number;
}
