import { SynthConfig } from "../../sound";

export interface Writer {
  className: string;
  hidden: string;
  letterDelay: number;
  pauseScale: number;
  fadeDuration: number;
  clackSound: SynthConfig;
}
