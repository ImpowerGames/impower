import { Create } from "../../../core/types/Create";
import { Style } from "../types/Style";

export const default_style: Create<Style> = (obj) => ({
  $type: "style",
  $name: "$default",
  $recursive: true,
  ...obj,
});
