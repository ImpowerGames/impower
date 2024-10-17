import { Create } from "../../../core/types/Create";
import { FilteredImage } from "../types/FilteredImage";

export const _filteredImage: Create<FilteredImage> = (obj) => ({
  $type: "filtered_image",
  image: null,
  filters: [],
  filtered_src: "",
  filtered_data: "",
  filtered_layers: [],
  ...obj,
});
