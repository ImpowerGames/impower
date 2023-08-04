import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidLoadProjectMethod = typeof DidLoadProjectMessage.method;

export interface DidLoadProjectParams {
  name: string;
}

export namespace DidLoadProjectMessage {
  export const method = "window/didLoadProject";
  export const type = new MessageProtocolNotificationType<
    DidLoadProjectMethod,
    DidLoadProjectParams
  >(DidLoadProjectMessage.method);
}
