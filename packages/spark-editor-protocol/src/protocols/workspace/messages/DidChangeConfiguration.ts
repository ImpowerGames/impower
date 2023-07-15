import {
  DidChangeConfigurationParams,
  NotificationMessage,
} from "../../../types";

export type DidChangeConfigurationMethod = typeof DidChangeConfiguration.method;

export interface DidChangeConfigurationNotificationMessage
  extends NotificationMessage<
    DidChangeConfigurationMethod,
    DidChangeConfigurationParams
  > {}

export class DidChangeConfiguration {
  static readonly method = "workspace/didChangeConfiguration";
  static isNotification(
    obj: any
  ): obj is DidChangeConfigurationNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: DidChangeConfigurationParams
  ): DidChangeConfigurationNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
