import { AudioBuffer } from "./AudioBuffer";
import { AudioParam } from "./AudioParam";

export interface AudioNode {
  onaudioprocess: (e: { outputBuffer: AudioBuffer }) => void;
  real: number[];
  imag: number[];
  type: string;
  gain: AudioParam;
  pan: AudioParam;
  detune: AudioParam;
  frequency: AudioParam;
  playbackRate: AudioParam;
  Q: AudioParam;
  loop: boolean;
  buffer: AudioBuffer;
  connect: (n: AudioNode | AudioParam) => void;
  disconnect: (n?: AudioParam) => void;
  start: (t?: number) => void;
  stop: (t?: number) => void;
  onended: ((this: AudioNode, ev: unknown) => unknown) | null;
  setPeriodicWave: (w: unknown) => void;
}
