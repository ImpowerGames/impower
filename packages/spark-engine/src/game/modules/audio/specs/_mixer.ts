import { Create } from "../../../core/types/Create";
import { Mixer } from "../types/Mixer";

export const _mixer: Create<Mixer> = (obj) => ({
  volume: 1,
  mute: false,
  ...obj,
});
