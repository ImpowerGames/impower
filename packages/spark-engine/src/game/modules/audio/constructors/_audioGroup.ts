import { Create } from "../../../core/types/Create";
import { AudioGroup } from "../types/AudioGroup";

export const _audioGroup: Create<AudioGroup> = (obj) => ({
  $type: "audio_group",
  assets: [],
  cues: [],
  ...obj,
});
