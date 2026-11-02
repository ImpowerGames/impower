import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { GameSave } from "@impower/spark-engine/src/game/core/types/GameSave";

export type SaveHereMethod = typeof SaveHereMessage.method;

export interface SaveHereParams {
  run: number;
}

export interface SaveHereResult {
  save: GameSave | null;
}

export class SaveHereMessage {
  static readonly method = "player/saveHere";
  static readonly type = new MessageProtocolRequestType<
    SaveHereMethod,
    SaveHereParams,
    SaveHereResult
  >(SaveHereMessage.method);
}

export namespace SaveHereMessage {
  export interface Request
    extends RequestMessage<SaveHereMethod, SaveHereParams, SaveHereResult> {}
}
