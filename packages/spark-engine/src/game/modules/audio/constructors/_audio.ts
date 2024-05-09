import { Audio } from "../../../core/types/Audio";
import { Create } from "../../../core/types/Create";

export const _audio: Create<Audio> = (obj) => ({
  $type: "audio",
  src: "",
  volume: 1,
  loop: false,
  cues: [],
  ...obj,
});
