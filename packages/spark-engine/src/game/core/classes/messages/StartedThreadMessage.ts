import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type StartedThreadMethod = typeof StartedThreadMessage.method;

export class StartedThreadMessage {
  static readonly method = "story/startedThread";
  static readonly type = new MessageProtocolNotificationType<
    StartedThreadMethod,
    {
      threadId: number;
    }
  >(StartedThreadMessage.method);
}
