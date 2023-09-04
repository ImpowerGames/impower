import { FileData } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidWriteFileMethod = typeof DidWriteFileMessage.method;

export interface DidWriteFileParams {
  file: FileData;
}

export namespace DidWriteFileMessage {
  export const method = "workspace/didWriteFile";
  export const type = new MessageProtocolNotificationType<
    DidWriteFileMethod,
    DidWriteFileParams
  >(DidWriteFileMessage.method);
}
