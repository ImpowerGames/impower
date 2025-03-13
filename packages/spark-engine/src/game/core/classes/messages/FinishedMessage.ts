import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type FinishedMethod = typeof FinishedMessage.method;

export class FinishedMessage {
  static readonly method = "story/finished";
  static readonly type = new MessageProtocolNotificationType<
    FinishedMethod,
    {}
  >(FinishedMessage.method);
}
