import { EaseType } from "../../../../../../../game";

export interface TypingConfig {
  letterDelay?: number;
  pauseScale?: number;
  fadeDuration?: number;
  punctuationTone?: string;
  punctuationEnvelope:
    | [number] // r
    | [number, number] // ar
    | [number, number, number] // adr
    | [number, number, number, number] // ahdr
    | string;
  punctuationContour:
    | [EaseType, EaseType] // ar
    | [EaseType, EaseType, EaseType] //adr
    | string;
  punctuationVolume?: number;
}
