import type { Reference } from "../../../core/types/Reference";

export interface FilteredImage extends Reference<"filtered_image"> {
  image:
    | Reference<"image">
    | Reference<"filtered_image">
    | Reference<"layered_image">
    | null;
  attributes: string[];
}
