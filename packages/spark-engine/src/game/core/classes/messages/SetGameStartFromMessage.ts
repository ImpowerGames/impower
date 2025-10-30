import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type SetGameStartFromMethod = typeof SetGameStartFromMessage.method;

export interface SetGameStartFromParams {
  startFrom: { file: string; line: number };
}

export interface SetGameStartFromResult {
  startFrom: { file: string; line: number };
}

export class SetGameStartFromMessage {
  static readonly method = "game/setStartFrom";
  static readonly type = new MessageProtocolRequestType<
    SetGameStartFromMethod,
    SetGameStartFromParams,
    SetGameStartFromResult
  >(SetGameStartFromMessage.method);
}

export namespace SetGameStartFromMessage {
  export interface Request
    extends RequestMessage<
      SetGameStartFromMethod,
      SetGameStartFromParams,
      SetGameStartFromResult
    > {}
  export interface Response
    extends ResponseMessage<SetGameStartFromMethod, SetGameStartFromResult> {}
}
