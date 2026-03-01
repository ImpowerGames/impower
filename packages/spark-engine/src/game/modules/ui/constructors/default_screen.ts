import { Create } from "../../../core/types/Create";

export const default_screen: Create<any> = (obj) => ({
  $type: "screen",
  $name: "$default",
  $recursive: true,
  ...obj,
});
