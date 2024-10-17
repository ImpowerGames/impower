import { Reference } from "../../../core/types/Reference";
import { Filter } from "../../../core/types/Filter";
import { Image } from "./Image";

export interface FilteredImage extends Reference<"filtered_image"> {
  image: Image | FilteredImage | null;
  filters: Filter[];
  filtered_src: string;
  filtered_data: string;
  filtered_layers: Image[];
}
