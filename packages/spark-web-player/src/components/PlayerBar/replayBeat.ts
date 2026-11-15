import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { PlayBeatMessage } from "@impower/spark-editor-protocol/src/protocols/preview/PlayBeatMessage";

export const REPLAY_BEAT = "Replay beat";

export const GAME_STARTING_REASON = "The game is starting.";

export const requestReplayBeat = () =>
  sendProtocolMessage(PlayBeatMessage.type.request({}));
