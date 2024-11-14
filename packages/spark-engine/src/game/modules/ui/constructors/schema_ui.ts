import { Schema } from "../../../core/types/Schema";
import { Create } from "../../../core/types/Create";

export const schema_ui: Create<Schema<any>> = () => ({
  $type: "style",
  $name: "$schema",
  image: [
    "none",
    { $type: "filtered_image" },
    { $type: "layered_image" },
    { $type: "image" },
    { $type: "pattern" },
    { $type: "gradient" },
  ],
});
