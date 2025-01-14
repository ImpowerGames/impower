import { AudioPlayerUpdate } from "./AudioPlayerUpdate";

export type AudioPlayerState = Omit<
  AudioPlayerUpdate,
  "control" | "after" | "over" | "channel" | "loop" | "now"
> & {
  syncedTo?: string;
};
