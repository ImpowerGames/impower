export interface SoundPlaybackControl {
  elapsedMS: number;
  latestEvent: number;
  layer?: string;
  group?: string;
  ready: boolean;
  scheduled: boolean;
  started: boolean;
  paused: boolean;
  looping: boolean;
}
