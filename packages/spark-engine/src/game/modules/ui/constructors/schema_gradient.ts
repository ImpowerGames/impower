import { Gradient } from "../../..";
import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

export const schema_gradient: Create<Schema<Gradient>> = () => ({
  $type: "gradient",
  $name: "$schema",
  type: ["linear", "radial"],
  angle: [1, 0, 360],
  stops: [
    {
      color: ["black", "white"],
      opacity: [0.01, 0, 1],
      position: [1, 0, 100],
    },
  ],
});
