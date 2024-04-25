import { Audio } from "../../types/Audio";
import { Create } from "../../types/Create";

export const _audio: Create<Audio> = (obj) => ({
  $type: "audio",
  src: "",
  volume: 1,
  loop: false,
  cues: [],
  ...obj,
});
