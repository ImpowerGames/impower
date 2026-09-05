import type { Create } from "../../../core/types/Create";
import type { Color } from "../types/Color";

export const default_color: Create<Color> = (obj) => ({
  $type: "color",
  $name: "$default",
  ...obj,
});
