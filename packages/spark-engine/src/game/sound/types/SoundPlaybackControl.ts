export interface SoundPlaybackControl {
  elapsedMS: number;
  latestEvent: number;
  layer?: string;
  group?: string;
  scheduled: boolean;
  started: boolean;
  paused: boolean;
  looping: boolean;
  volume: number;
}
