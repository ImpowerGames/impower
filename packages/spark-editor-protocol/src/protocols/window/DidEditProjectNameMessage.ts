import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidEditProjectNameMethod = typeof DidEditProjectNameMessage.method;

export interface DidEditProjectNameParams {
  name: string;
}

export namespace DidEditProjectNameMessage {
  export const method = "window/didEditProjectName";
  export const type = new MessageProtocolNotificationType<
    DidEditProjectNameMethod,
    DidEditProjectNameParams
  >(DidEditProjectNameMessage.method);
}
