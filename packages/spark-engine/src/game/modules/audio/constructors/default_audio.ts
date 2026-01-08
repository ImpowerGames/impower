import { Audio } from "../../../core/types/Audio";
import { Create } from "../../../core/types/Create";

export const default_audio: Create<Audio> = (obj) => ({
  $type: "audio",
  $name: "$default",
  $link: {
    image: {},
    synth: {},
    character: {},
    typewriter: {},
    inflection: {},
    prosody: {},
  },
  src: "",
  volume: 1,
  loop: false,
  loop_start: 0,
  loop_end: 0,
  cues: [0],
  ...obj,
});
