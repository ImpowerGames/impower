import { Create } from "../../../core/types/Create";
import { Transition } from "../types/Transition";

export const _transition: Create<Transition> = (obj) => ({
  $type: "transition",
  on_hide: "hide",
  on_show: "show",
  ...obj,
});
