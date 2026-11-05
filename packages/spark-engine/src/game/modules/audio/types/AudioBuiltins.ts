import type { Audio } from "../../../core/types/Audio";
import type { Channel } from "./Channel";
import type { LayeredAudio } from "./LayeredAudio";
import type { Mixer } from "./Mixer";
import type { Synth } from "./Synth";

export interface AudioBuiltins {
  audio: Record<string, Audio>;
  layered_audio: Record<string, LayeredAudio>;
  synth: Record<string, Synth>;
  mixer: Record<string, Mixer>;
  channel: Record<string, Channel>;
}
