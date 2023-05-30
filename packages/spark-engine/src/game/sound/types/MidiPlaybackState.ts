export interface SoundPlaybackControl {
  elapsedMS: number;
  durationMS: number;
  latestEvent: number;
  started: boolean;
  paused: boolean;
}
