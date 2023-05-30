import { Activable } from "../Activable";
import { ImageFrameConfig } from "./ImageFrameConfig";

export interface ImageConfig {
  frames: Activable<ImageFrameConfig>;
}
