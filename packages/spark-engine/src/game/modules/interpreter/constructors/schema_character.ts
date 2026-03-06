import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

export const schema_character: Create<Schema<any>> = () => ({
  $type: "character",
  $name: "$schema",
  color: ["", { $type: "color" }],
});
