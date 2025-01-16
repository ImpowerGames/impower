import { AudioPlayerUpdate } from "./AudioPlayerUpdate";

export interface UpdateAudioPlayersParams {
  channel: string;
  updates: AudioPlayerUpdate[];
}
