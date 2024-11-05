import { Shadow } from "../../..";
import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

export const schema_shadow: Create<Schema<Shadow>> = () => ({
  $type: "shadow",
  $name: "$schema",
  layers: [
    {
      x: [1, 0, 10],
      y: [1, 0, 10],
      blur: [1, 0, 20],
      spread: [1, 0, 10],
      color: ["black", "white"],
      opacity: [0.01, 0, 1],
    },
  ],
});
