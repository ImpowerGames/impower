export interface SoundPlaybackControl {
  elapsedMS: number;
  latestEvent: number;
  channel?: string;
  group?: string;
  started: boolean;
  paused: boolean;
  muted: boolean;
  volume: number;
}
