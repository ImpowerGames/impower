import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { SaveValues } from "@impower/sparkdown/src/program/saveValueSet";

export type SaveValuesMethod = typeof SaveValuesMessage.method;

export interface SaveValuesParams {
  data: string;
}

export interface SaveValuesResult {
  values: SaveValues;
}

export class SaveValuesMessage {
  static readonly method = "player/saveValues";
  static readonly type = new MessageProtocolRequestType<
    SaveValuesMethod,
    SaveValuesParams,
    SaveValuesResult
  >(SaveValuesMessage.method);
}

export namespace SaveValuesMessage {
  export interface Request
    extends RequestMessage<SaveValuesMethod, SaveValuesParams, SaveValuesResult> {}
}
