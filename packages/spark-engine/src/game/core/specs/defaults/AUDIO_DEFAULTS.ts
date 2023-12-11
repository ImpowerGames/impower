import { Asset } from "../Asset";
import { _audio } from "./_audio";

export const AUDIO_DEFAULTS: Record<string, Asset> = {
  default: _audio(),
};
