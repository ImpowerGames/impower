import { Reference } from "../../../core/types/Reference";

export interface LayeredImage extends Reference<"layered_image"> {
  assets: Reference<"image">[];
}
