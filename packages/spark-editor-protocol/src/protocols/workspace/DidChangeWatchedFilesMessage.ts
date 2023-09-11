import { DidChangeWatchedFilesParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeWatchedFilesMethod =
  typeof DidChangeWatchedFilesMessage.method;

export class DidChangeWatchedFilesMessage {
  static readonly method = "workspace/didChangeWatchedFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeWatchedFilesMethod,
    DidChangeWatchedFilesParams
  >(DidChangeWatchedFilesMessage.method);
}
