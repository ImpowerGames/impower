import type * as LSP from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type PublishDiagnosticsMethod = typeof PublishDiagnosticsMessage.method;

export type PublishDiagnosticsParams = LSP.PublishDiagnosticsParams;

export class PublishDiagnosticsMessage {
  static readonly method = "textDocument/publishDiagnostics";
  static readonly type = new MessageProtocolNotificationType<
    PublishDiagnosticsMethod,
    PublishDiagnosticsParams
  >(PublishDiagnosticsMessage.method);
}
