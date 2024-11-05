import { Ease } from "../../..";
import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

export const schema_ease: Create<Schema<Ease>> = () => ({
  $type: "ease",
  $name: "$schema",
  x1: [0.01, 0, 1],
  y1: [0.01, -2, 2],
  x2: [0.01, 0, 1],
  y2: [0.01, -2, 2],
});
