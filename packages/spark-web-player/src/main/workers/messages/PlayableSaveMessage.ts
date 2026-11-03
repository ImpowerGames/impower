import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { SaveSource } from "@impower/spark-engine/src/game/core/types/GameSave";

export type PlayableSaveMethod = typeof PlayableSaveMessage.method;

export interface PlayableSaveParams {
  save: SaveSource;
}

export interface PlayableSaveResult {
  save: SaveSource;
}

export class PlayableSaveMessage {
  static readonly method = "player/playableSave";
  static readonly type = new MessageProtocolRequestType<
    PlayableSaveMethod,
    PlayableSaveParams,
    PlayableSaveResult
  >(PlayableSaveMessage.method);
}

export namespace PlayableSaveMessage {
  export interface Request
    extends RequestMessage<PlayableSaveMethod, PlayableSaveParams, PlayableSaveResult> {}
}
