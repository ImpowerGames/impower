import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenFileMethod = typeof DidOpenFileMessage.method;

export interface DidOpenFileParams {
  file: { uri: string };
}

export namespace DidOpenFileMessage {
  export const method = "workspace/didOpenFile";
  export const type = new MessageProtocolNotificationType<
    DidOpenFileMethod,
    DidOpenFileParams
  >(DidOpenFileMessage.method);
}
