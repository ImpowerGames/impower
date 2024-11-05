import { Create } from "../../../core/types/Create";
import { FilteredImage } from "../types/FilteredImage";

export const default_filtered_image: Create<FilteredImage> = (obj) => ({
  $type: "filtered_image",
  $name: "$default",
  image: null,
  filters: [],
  filtered_src: "",
  filtered_data: "",
  filtered_layers: [],
  ...obj,
});
