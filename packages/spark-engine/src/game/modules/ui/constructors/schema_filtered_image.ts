import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";
import { FilteredImage } from "../types/FilteredImage";

export const schema_filtered_image: Create<Schema<FilteredImage>> = () => ({
  $type: "filtered_image",
  $name: "$schema",
  image: [
    { $type: "filtered_image" },
    { $type: "layered_image" },
    { $type: "image" },
  ],
});
