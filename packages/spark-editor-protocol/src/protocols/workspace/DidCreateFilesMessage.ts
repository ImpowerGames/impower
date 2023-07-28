import { CreateFilesParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCreateFilesMethod = typeof DidCreateFilesMessage.method;

export interface DidCreateFilesParams extends CreateFilesParams {}

export namespace DidCreateFilesMessage {
  export const method = "workspace/didCreateFiles";
  export const type = new MessageProtocolNotificationType<
    DidCreateFilesMethod,
    DidCreateFilesParams
  >(DidCreateFilesMessage.method);
}
