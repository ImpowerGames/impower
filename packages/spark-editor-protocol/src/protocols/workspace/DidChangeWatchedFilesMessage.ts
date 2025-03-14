import type * as LSP from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeWatchedFilesMethod =
  typeof DidChangeWatchedFilesMessage.method;

export type DidChangeWatchedFilesParams = LSP.DidChangeWatchedFilesParams;

export class DidChangeWatchedFilesMessage {
  static readonly method = "workspace/didChangeWatchedFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeWatchedFilesMethod,
    DidChangeWatchedFilesParams
  >(DidChangeWatchedFilesMessage.method);
}
