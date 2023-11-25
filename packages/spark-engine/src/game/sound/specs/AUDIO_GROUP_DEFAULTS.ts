import { AudioGroup } from "../types/AudioGroup";
import { _audioGroup } from "./_audioGroup";

export const AUDIO_GROUP_DEFAULTS: Record<string, AudioGroup> = {
  "": _audioGroup(),
};
