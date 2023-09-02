import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidLoadProjectNameMethod = typeof DidLoadProjectNameMessage.method;

export interface DidLoadProjectNameParams {
  name: string;
}

export namespace DidLoadProjectNameMessage {
  export const method = "workspace/didLoadProjectName";
  export const type = new MessageProtocolNotificationType<
    DidLoadProjectNameMethod,
    DidLoadProjectNameParams
  >(DidLoadProjectNameMessage.method);
}
