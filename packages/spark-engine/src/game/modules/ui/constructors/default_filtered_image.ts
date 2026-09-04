import type { Create } from "../../../core/types/Create";
import type { FilteredImage } from "../types/FilteredImage";

export const default_filtered_image: Create<FilteredImage> = (obj) => ({
  $type: "filtered_image",
  $name: "$default",
  image: { $type: "image", $name: "none" },
  filters: [{ $type: "filter", $name: "none" }],
  ...obj,
});
