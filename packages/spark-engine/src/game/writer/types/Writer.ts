import { SynthConfig } from "../../sound";

export interface Writer {
  className: string;
  hidden: string;
  letterDelay: number;
  phrasePauseScale: number;
  stressPauseScale: number;
  yellPauseScale: number;
  punctuatePauseScale: number;
  fadeDuration: number;
  clackSound: SynthConfig;
  minSyllableLength: number;
  /** Words that are spoken aloud */
  voiced: string;
  /** Words that are pitched up */
  yelled: string;
  /** Phrases where each char is punctuated with a clack sound */
  punctuated: string;
}
