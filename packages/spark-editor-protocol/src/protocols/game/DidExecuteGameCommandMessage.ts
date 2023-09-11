import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidExecuteGameCommandMethod =
  typeof DidExecuteGameCommandMessage.method;

export interface DidExecuteGameCommandParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export class DidExecuteGameCommandMessage {
  static readonly method = "game/didExecuteCommand";
  static readonly type = new MessageProtocolNotificationType<
    DidExecuteGameCommandMethod,
    DidExecuteGameCommandParams
  >(DidExecuteGameCommandMessage.method);
}
