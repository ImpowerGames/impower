export interface VideoConfig {
  hasAudio: boolean;
}

export const isVideoConfig = (obj: unknown): obj is VideoConfig => {
  if (!obj) {
    return false;
  }
  const videoConfig = obj as VideoConfig;
  return videoConfig.hasAudio !== undefined;
};

export const createVideoConfig = (obj?: Partial<VideoConfig>): VideoConfig => ({
  hasAudio: true,
  ...obj,
});
