export interface AudioConfig {
  mute: boolean;
  volume: number;
  rate: number;
  pitch: number;
  seek: number;
  loop: boolean;
  delay: number;
}

export const isAudioConfig = (obj: unknown): obj is AudioConfig => {
  if (!obj) {
    return false;
  }
  const audioConfig = obj as AudioConfig;
  return (
    audioConfig.mute !== undefined &&
    audioConfig.volume !== undefined &&
    audioConfig.rate !== undefined &&
    audioConfig.pitch !== undefined &&
    audioConfig.seek !== undefined &&
    audioConfig.loop !== undefined &&
    audioConfig.delay !== undefined
  );
};

export const createAudioConfig = (obj?: Partial<AudioConfig>): AudioConfig => ({
  volume: 1,
  rate: 1,
  pitch: 0,
  seek: 0,
  delay: 0,
  loop: false,
  mute: false,
  ...obj,
});
