import { Reference } from "../../../core/types/Reference";
import { Image } from "./Image";

export interface ImageGroup extends Reference<"image_group"> {
  assets: (Image | ImageGroup)[];
}
