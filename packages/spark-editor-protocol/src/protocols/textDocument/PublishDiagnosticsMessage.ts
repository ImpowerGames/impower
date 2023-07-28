import { PublishDiagnosticsParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type PublishDiagnosticsMethod = typeof PublishDiagnosticsMessage.method;

export namespace PublishDiagnosticsMessage {
  export const method = "textDocument/publishDiagnostics";
  export const type = new MessageProtocolNotificationType<
    PublishDiagnosticsMethod,
    PublishDiagnosticsParams
  >(PublishDiagnosticsMessage.method);
}
