export interface SoundPlaybackControl {
  elapsedMS: number;
  latestEvent: number;
  started: boolean;
  paused: boolean;
}
