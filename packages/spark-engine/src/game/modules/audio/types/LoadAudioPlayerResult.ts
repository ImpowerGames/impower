import { LoadAudioPlayerParams } from "./LoadAudioPlayerParams";

export interface LoadAudioPlayerResult extends LoadAudioPlayerParams {
  outputLatency?: number;
}
