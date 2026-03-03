import { Create } from "../../../core/types/Create";
import { Color } from "../types/Color";

export const default_color: Create<Color> = (obj) => ({
  $type: "color",
  $name: "$default",
  ...obj,
});
