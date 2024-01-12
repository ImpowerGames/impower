import { Range, TextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type WillExecuteGameCommandMethod =
  typeof WillExecuteGameCommandMessage.method;

export interface WillExecuteGameCommandParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export class WillExecuteGameCommandMessage {
  static readonly method = "game/willExecuteCommand";
  static readonly type = new MessageProtocolNotificationType<
    WillExecuteGameCommandMethod,
    WillExecuteGameCommandParams
  >(WillExecuteGameCommandMessage.method);
}
