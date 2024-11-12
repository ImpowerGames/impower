import { Create } from "../../../core/types/Create";
import { Transition } from "../types/Transition";

export const default_transition: Create<Transition> = (obj) => ({
  $type: "transition",
  $name: "$default",
  on_hide: { $type: "animation", $name: "hide" },
  on_show: { $type: "animation", $name: "show" },
  ...obj,
});
