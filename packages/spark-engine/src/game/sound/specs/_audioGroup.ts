import { Create } from "../../core/types/Create";
import { AudioGroup } from "../types/AudioGroup";

export const _audioGroup: Create<AudioGroup> = () => ({
  assets: [],
  cues: [],
  loop: false,
  volume: 1,
});
