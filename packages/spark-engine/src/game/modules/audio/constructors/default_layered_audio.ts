import { Create } from "../../../core/types/Create";
import { LayeredAudio } from "../types/LayeredAudio";

export const default_layered_audio: Create<LayeredAudio> = (obj) => ({
  $type: "layered_audio",
  $name: "$default",
  assets: [],
  cues: [],
  ...obj,
});
