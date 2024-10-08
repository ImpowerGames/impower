import { Reference } from "../../../core/types/Reference";
import { Image } from "./Image";

export interface LayeredImage extends Reference<"layered_image"> {
  assets: (Image | LayeredImage)[];
}
