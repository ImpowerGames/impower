import { FileData } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidWriteFilesMethod = typeof DidWriteFilesMessage.method;

export interface DidWriteFilesParams {
  files: FileData[];
  remote: boolean;
}

export class DidWriteFilesMessage {
  static readonly method = "workspace/didWriteFiles";
  static readonly type = new MessageProtocolNotificationType<
    DidWriteFilesMethod,
    DidWriteFilesParams
  >(DidWriteFilesMessage.method);
}
