import { Activable } from "../../../../impower-core";
import { createImageFrameConfig, ImageFrameConfig } from "./imageFrameConfig";

export interface ImageConfig {
  frames: Activable<ImageFrameConfig>;
}

export const isImageConfig = (obj: unknown): obj is ImageConfig => {
  if (!obj) {
    return false;
  }
  const imageConfig = obj as ImageConfig;
  return imageConfig.frames !== undefined;
};

export const createImageConfig = (obj?: Partial<ImageConfig>): ImageConfig => ({
  frames: {
    active: false,
    value: createImageFrameConfig(),
  },
  ...obj,
});
