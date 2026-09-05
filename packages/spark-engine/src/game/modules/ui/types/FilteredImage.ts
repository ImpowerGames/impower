import type { Reference } from "../../../core/types/Reference";
import type { Image } from "./Image";

export interface FilteredImage extends Reference<"filtered_image"> {
  image:
    | Reference<"image">
    | Reference<"filtered_image">
    | Reference<"layered_image">
    | null;
  filters: Reference<"filter">[];
  filtered_src?: string;
  filtered_layers?: Image[];
}
