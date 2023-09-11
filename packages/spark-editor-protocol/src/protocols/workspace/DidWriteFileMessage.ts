import { FileData } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidWriteFileMethod = typeof DidWriteFileMessage.method;

export interface DidWriteFileParams {
  file: FileData;
}

export class DidWriteFileMessage {
  static readonly method = "workspace/didWriteFile";
  static readonly type = new MessageProtocolNotificationType<
    DidWriteFileMethod,
    DidWriteFileParams
  >(DidWriteFileMessage.method);
}
