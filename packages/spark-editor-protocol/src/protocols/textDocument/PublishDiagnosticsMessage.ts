import {
  MessageDirection,
  PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type PublishDiagnosticsMethod = typeof PublishDiagnosticsMessage.method;

export abstract class PublishDiagnosticsMessage {
  static readonly method = "textDocument/publishDiagnostics";
  static readonly messageDirection = MessageDirection.serverToClient;
  static readonly type = new MessageProtocolNotificationType<
    PublishDiagnosticsMethod,
    PublishDiagnosticsParams
  >(PublishDiagnosticsMessage.method);
}
