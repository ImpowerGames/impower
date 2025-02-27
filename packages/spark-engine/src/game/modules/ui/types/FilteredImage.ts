import { Reference } from "../../../core/types/Reference";
import { Image } from "./Image";

export interface FilteredImage extends Reference<"filtered_image"> {
  image: Reference<"image"> | Reference<"filtered_image"> | null;
  filters: Reference<"filter">[];
  filtered_src?: string;
  filtered_layers?: Image[];
}
