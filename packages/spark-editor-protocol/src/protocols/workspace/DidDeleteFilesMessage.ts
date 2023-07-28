import { DeleteFilesParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidDeleteFilesMethod = typeof DidDeleteFilesMessage.method;

export interface DidDeleteFilesParams extends DeleteFilesParams {}

export namespace DidDeleteFilesMessage {
  export const method = "workspace/didDeleteFiles";
  export const type = new MessageProtocolNotificationType<
    DidDeleteFilesMethod,
    DidDeleteFilesParams
  >(DidDeleteFilesMessage.method);
}
