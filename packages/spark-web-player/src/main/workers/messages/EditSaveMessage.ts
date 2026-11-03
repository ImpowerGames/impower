import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { SaveSource } from "@impower/spark-engine/src/game/core/types/GameSave";

export type EditSaveMethod = typeof EditSaveMessage.method;

export interface EditSaveParams {
  save: SaveSource;
  key: string;
  value: string;
}

export interface EditSaveResult {
  save: SaveSource;
}

export class EditSaveMessage {
  static readonly method = "player/editSave";
  static readonly type = new MessageProtocolRequestType<
    EditSaveMethod,
    EditSaveParams,
    EditSaveResult
  >(EditSaveMessage.method);
}

export namespace EditSaveMessage {
  export interface Request
    extends RequestMessage<EditSaveMethod, EditSaveParams, EditSaveResult> {}
}
