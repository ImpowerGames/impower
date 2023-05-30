import { MidiTrackState } from "../types/MidiTrackState";

export const createOrResetMidiTrackState = (
  state?: MidiTrackState
): MidiTrackState => {
  if (state) {
    state.currentTime = 0;
    state.duration = 0;
    state.mpq = 0;
    state.channels = [];
  }
  return {
    currentTime: 0,
    duration: 0,
    mpq: 0,
    channels: [],
  };
};
