import { DidChangeWatchedFilesParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeWatchedFilesMethod =
  typeof DidChangeWatchedFilesMessage.method;

export namespace DidChangeWatchedFilesMessage {
  export const method = "workspace/didChangeWatchedFiles";
  export const type = new MessageProtocolNotificationType<
    DidChangeWatchedFilesMethod,
    DidChangeWatchedFilesParams
  >(DidChangeWatchedFilesMessage.method);
}
