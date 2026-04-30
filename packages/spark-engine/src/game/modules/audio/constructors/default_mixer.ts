import { type Create } from "../../../core/types/Create";
import { type Mixer } from "../types/Mixer";

export const default_mixer: Create<Mixer> = (obj) => ({
  $type: "mixer",
  $name: "$default",
  gain: 1,
  ...obj,
});
