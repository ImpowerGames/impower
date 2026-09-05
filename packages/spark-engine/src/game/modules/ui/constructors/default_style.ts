import type { Create } from "../../../core/types/Create";
import type { Style } from "../types/Style";

export const default_style: Create<Style> = (obj) => ({
  $type: "style",
  $name: "$default",
  $recursive: true,
  ...obj,
});
