import { Create } from "../../../core/types/Create";
import { Ease } from "../types/Ease";

export const default_ease: Create<Ease> = (obj) => ({
  $type: "ease",
  $name: "$default",
  function: "cubic-bezier",
  parameters: [0.2, 0, 0, 1],
  ...obj,
});
