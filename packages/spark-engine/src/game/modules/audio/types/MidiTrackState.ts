import { MidiChannelState } from "./MidiChannelState";

export interface MidiTrackState {
  currentTime: number;
  duration: number;
  mpq: number;
  channels: MidiChannelState[];
}
