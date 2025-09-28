import { Create } from "../../../core/types/Create";

export const default_layout: Create<any> = (obj) => ({
  $type: "layout",
  $name: "$default",
  $recursive: true,
  ...obj,
});
