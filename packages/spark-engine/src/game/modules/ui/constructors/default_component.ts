import { Create } from "../../../core/types/Create";

export const default_component: Create<any> = (obj) => ({
  $type: "component",
  $name: "$default",
  $recursive: true,
  ...obj,
});
