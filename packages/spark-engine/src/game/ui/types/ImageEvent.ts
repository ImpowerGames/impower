import { ImageState } from "./ImageState";

export interface ImageEvent extends ImageState {
  enter?: number;
  exit?: number;
}
