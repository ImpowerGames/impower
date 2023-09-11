import { PublishDiagnosticsParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type PublishDiagnosticsMethod = typeof PublishDiagnosticsMessage.method;

export class PublishDiagnosticsMessage {
  static readonly method = "textDocument/publishDiagnostics";
  static readonly type = new MessageProtocolNotificationType<
    PublishDiagnosticsMethod,
    PublishDiagnosticsParams
  >(PublishDiagnosticsMessage.method);
}
