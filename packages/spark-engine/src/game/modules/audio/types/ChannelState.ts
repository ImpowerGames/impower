import { AudioUpdate } from "./AudioUpdate";

export interface ChannelState {
  looping?: Record<string, AudioUpdate>;
}
