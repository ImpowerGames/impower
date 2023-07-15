import { CreateFilesParams, NotificationMessage } from "../../../types";

export type DidCreateFilesMethod = typeof DidCreateFiles.method;

export interface DidCreateFilesNotificationMessage
  extends NotificationMessage<DidCreateFilesMethod, CreateFilesParams> {
  params: CreateFilesParams;
}

export class DidCreateFiles {
  static readonly method = "workspace/didCreateFiles";
  static isNotification(obj: any): obj is DidCreateFilesNotificationMessage {
    return obj.method === this.method && obj.result === undefined;
  }
  static notification(
    params: CreateFilesParams
  ): DidCreateFilesNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
