import { Font } from "../../..";
import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

export const schema_font: Create<Schema<Font>> = () => ({
  $type: "font",
  $name: "$schema",
  weight: [100, 100, 900],
  style: ["normal", "italic", "oblique"],
});
