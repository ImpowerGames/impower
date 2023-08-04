import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type WillEditProjectNameMethod =
  typeof WillEditProjectNameMessage.method;

export interface WillEditProjectNameParams {}

export namespace WillEditProjectNameMessage {
  export const method = "window/willEditProjectName";
  export const type = new MessageProtocolNotificationType<
    WillEditProjectNameMethod,
    WillEditProjectNameParams
  >(WillEditProjectNameMessage.method);
}
