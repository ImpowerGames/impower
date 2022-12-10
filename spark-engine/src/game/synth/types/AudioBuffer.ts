export interface AudioBuffer {
  getChannelData: (i: number) => Float32Array;
}
