import { Create } from "../../../core/types/Create";
import { LayeredAudio } from "../types/LayeredAudio";

export const _layeredAudio: Create<LayeredAudio> = (obj) => ({
  $type: "layered_audio",
  assets: [],
  cues: [],
  ...obj,
});
