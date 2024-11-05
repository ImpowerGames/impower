import { Create } from "../../../core/types/Create";

export const default_ui: Create<any> = (obj) => ({
  $type: "ui",
  $name: "$default",
  ...obj,
});
