import { AudioBuffer } from "./AudioBuffer";
import { AudioNode } from "./AudioNode";

export interface AudioContext {
  sampleRate: number;
  currentTime: number;
  destination: AudioNode;
  createPeriodicWave: (
    real: number[],
    imag: number[],
    options?: { disableNormalization: boolean }
  ) => unknown;
  createBuffer: (
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ) => AudioBuffer;
  createBufferSource: () => AudioNode;
  createGain: () => AudioNode;
  createConvolver: () => AudioNode;
  createDynamicsCompressor: () => AudioNode;
  createOscillator: () => AudioNode;
  createStereoPanner: () => AudioNode;
  createBiquadFilter(): AudioNode;
  createSandH?: () => AudioNode;
  createScriptProcessor: (
    bufferSize: number,
    numberOfInputChannels: number,
    numberOfOutputChannels: number
  ) => AudioNode;
}
