import { Audio } from "../../../core/types/Audio";
import { Create } from "../../../core/types/Create";

export const default_audio: Create<Audio> = (obj) => ({
  $type: "audio",
  $name: "$default",
  src: "",
  volume: 1,
  loop: false,
  cues: [0],
  ...obj,
});
