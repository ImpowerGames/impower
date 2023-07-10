import { NotificationMessage } from "../../base/NotificationMessage";

export type DidChangeWorkspaceConfigurationMethod =
  typeof DidChangeWorkspaceConfigurationNotification.method;

export interface DidChangeWorkspaceConfigurationParams {
  settings: Record<string, unknown>;
}

export interface DidChangeWorkspaceConfigurationMessage
  extends NotificationMessage<
    DidChangeWorkspaceConfigurationMethod,
    DidChangeWorkspaceConfigurationParams
  > {}

export class DidChangeWorkspaceConfigurationNotification {
  static readonly method = "workspace/didChangeConfiguration";
  static is(obj: any): obj is DidChangeWorkspaceConfigurationMessage {
    return obj.method === this.method;
  }
  static message(
    params: DidChangeWorkspaceConfigurationParams
  ): DidChangeWorkspaceConfigurationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
