import type * as LSP from "../../types";
import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeWatchedFilesMethod =
  typeof DidChangeWatchedFilesMessage.method;

export interface DidChangeWatchedFilesParams
  extends LSP.DidChangeWatchedFilesParams {
  remote?: boolean;
  commits?: LSP.FileCommits;
}

export class DidChangeWatchedFilesMessage {
  static readonly method = "workspace/didChangeWatchedFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeWatchedFilesMethod,
    DidChangeWatchedFilesParams
  >(DidChangeWatchedFilesMessage.method);
}

export namespace DidChangeWatchedFilesMessage {
  export interface Notification extends NotificationMessage<
    DidChangeWatchedFilesMethod,
    DidChangeWatchedFilesParams
  > {}
}
