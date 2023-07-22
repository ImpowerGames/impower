import { DidChangeWatchedFilesParams } from "../../../types";
import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type DidChangeWatchedFilesMethod = typeof DidChangeWatchedFiles.method;

export abstract class DidChangeWatchedFiles {
  static readonly method = "workspace/didChangeWatchedFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeWatchedFilesMethod,
    DidChangeWatchedFilesParams
  >(DidChangeWatchedFiles.method);
}
