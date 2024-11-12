import { Reference } from "../../../core/types/Reference";

export interface LayeredImage extends Reference<"layered_image"> {
  layers: Reference<"image">[];
}
