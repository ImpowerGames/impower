import { SoundConfig } from "../../../../../../../game/synth/types/Sound";

export interface TypewriterConfig {
  letterDelay?: number;
  pauseScale?: number;
  fadeDuration?: number;
  clackSound: SoundConfig;
}
