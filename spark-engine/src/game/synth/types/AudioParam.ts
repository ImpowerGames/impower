export interface AudioParam {
  value: number;
  setValueAtTime: (v: number, t: number) => void;
  setTargetAtTime: (v: number, t: number, d: number) => void;
  linearRampToValueAtTime: (value: number, endTime: number) => AudioParam;
  exponentialRampToValueAtTime: (value: number, endTime: number) => AudioParam;
  cancelScheduledValues: (t: number) => void;
  stop: () => void;
}
