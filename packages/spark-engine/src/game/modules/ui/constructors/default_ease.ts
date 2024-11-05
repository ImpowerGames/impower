import { Create } from "../../../core/types/Create";
import { Ease } from "../types/Ease";

export const default_ease: Create<Ease> = (obj) => ({
  $type: "ease",
  $name: "$default",
  x1: 0.2,
  y1: 0,
  x2: 0,
  y2: 1,
  ...obj,
});
