import { Create } from "../../../core/types/Create";
import { LayeredAudio } from "../types/LayeredAudio";

export const default_layered_audio: Create<LayeredAudio> = (obj) => ({
  $type: "layered_audio",
  $name: "$default",
  assets: [{ $type: "audio", $name: "none" }],
  cues: [0],
  loop_start: 0,
  loop_end: 0,
  ...obj,
});
