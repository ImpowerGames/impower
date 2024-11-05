import { Create } from "../../../core/types/Create";
import { Mixer } from "../types/Mixer";

export const default_mixer: Create<Mixer> = (obj) => ({
  $type: "mixer",
  $name: "$default",
  volume: 1,
  mute: false,
  ...obj,
});
