import { Create } from "../../../core/types/Create";

export const default_theme: Create<any> = (obj) => ({
  $type: "theme",
  $name: "$default",
  $recursive: true,
  ...obj,
});
