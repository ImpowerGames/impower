import { Create } from "../types/Create";
import { World } from "../types/World";

export const default_world: Create<World> = (obj) => ({
  $type: "world",
  $name: "$default",
  src: "",
  ...obj,
});
