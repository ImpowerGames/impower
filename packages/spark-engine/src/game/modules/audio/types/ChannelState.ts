import { AudioPlayerUpdate } from "./AudioPlayerUpdate";

export interface ChannelState {
  looping?: Record<string, AudioPlayerUpdate>;
}
