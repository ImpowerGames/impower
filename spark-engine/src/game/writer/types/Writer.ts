import { SoundConfig } from "../../synth";

export interface Writer {
  className: string;
  hidden: string;
  letterDelay: number;
  pauseScale: number;
  fadeDuration: number;
  clackSound: SoundConfig;
}
