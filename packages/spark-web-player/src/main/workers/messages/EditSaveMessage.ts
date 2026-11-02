import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { SaveValues } from "@impower/sparkdown/src/program/saveValueSet";

export type EditSaveMethod = typeof EditSaveMessage.method;

export interface EditSaveParams {
  data: string;
  changes: Record<string, string>;
}

export interface EditSaveResult {
  data: string;
  values: SaveValues;
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
