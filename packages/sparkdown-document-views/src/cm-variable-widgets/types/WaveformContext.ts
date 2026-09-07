import { WaveformConfig } from "./WaveformConfig";

export interface WaveformContext extends WaveformConfig {
  soundBuffer?: Float32Array<ArrayBuffer>;
  volumeBuffer?: Float32Array;
  pitchBuffer?: Float32Array;
  referenceBuffer?: Float32Array<ArrayBuffer>;
  referenceFileName?: string;
  pitchRange?: [number, number];

  xOffset: number;
  zoomOffset: number;
  soundVisible?: boolean;
  referenceVisible?: boolean;
}
