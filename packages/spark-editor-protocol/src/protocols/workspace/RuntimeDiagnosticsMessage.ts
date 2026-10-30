import type { Diagnostic } from "../../types";
import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type RuntimeDiagnosticsMethod = typeof RuntimeDiagnosticsMessage.method;

export interface RuntimeDiagnosticsParams {
  program: { uri: string; scripts: Record<string, number> };
  diagnostics: Record<string, Diagnostic[]>;
}

export class RuntimeDiagnosticsMessage {
  static readonly method = "sparkdown/runtimeDiagnostics";
  static readonly type = new MessageProtocolNotificationType<
    RuntimeDiagnosticsMethod,
    RuntimeDiagnosticsParams
  >(RuntimeDiagnosticsMessage.method);
}

export namespace RuntimeDiagnosticsMessage {
  export interface Notification extends NotificationMessage<
    RuntimeDiagnosticsMethod,
    RuntimeDiagnosticsParams
  > {}
}
