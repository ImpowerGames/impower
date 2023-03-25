export interface MidiChannelState {
  isPercussion: boolean;
  instrument: number;
  volume: number;
  pitchBend: number;
  pressure: number;
  keyPressures: number[];
}
