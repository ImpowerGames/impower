export interface SoundPlaybackControl {
  elapsedMS: number;
  latestEvent: number;
  layer?: string;
  group?: string;
  started: boolean;
  paused: boolean;
  muted: boolean;
  volume: number;
}
