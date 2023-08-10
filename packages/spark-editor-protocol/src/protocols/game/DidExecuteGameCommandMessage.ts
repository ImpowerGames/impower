import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidExecuteGameCommandMethod =
  typeof DidExecuteGameCommandMessage.method;

export interface DidExecuteGameCommandParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export namespace DidExecuteGameCommandMessage {
  export const method = "game/didExecuteCommand";
  export const type = new MessageProtocolNotificationType<
    DidExecuteGameCommandMethod,
    DidExecuteGameCommandParams
  >(DidExecuteGameCommandMessage.method);
}
