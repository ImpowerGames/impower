import { MidiChannelState } from "../types/MidiChannelState";

export const createMidiChannelState = (
  channelNumber: number
): MidiChannelState => ({
  isPercussion: channelNumber === 9,
  instrument: 0,
  volume: 1,
  pitchBend: 0,
  pressure: 0,
  keyPressures: [],
});
