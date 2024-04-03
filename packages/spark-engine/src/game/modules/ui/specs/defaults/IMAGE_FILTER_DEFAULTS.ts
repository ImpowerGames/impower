import { ImageFilter } from "../../types/ImageFilter";
import { _imageFilter } from "../_imageFilter";

export const IMAGE_FILTER_DEFAULTS: Record<string, ImageFilter> = {
  default: _imageFilter(),
};
