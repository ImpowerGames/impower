import { Create } from "../../../core/types/Create";
import { Optional } from "../../../core/types/Optional";
import { Animation } from "../types/Animation";
import { default_animation } from "./default_animation";
import { properties_style } from "./optional_style";

export const optional_animation: Create<Optional<Animation>> = (obj) => ({
  $type: "animation",
  $name: "$optional",
  ...obj,
  keyframes: obj?.keyframes ?? [properties_style()],
  timing: {
    ...default_animation().timing,
    ...obj?.timing,
  },
});
