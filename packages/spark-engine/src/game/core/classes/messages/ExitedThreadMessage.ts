import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ExitedThreadMethod = typeof ExitedThreadMessage.method;

export class ExitedThreadMessage {
  static readonly method = "story/exitedThread";
  static readonly type = new MessageProtocolNotificationType<
    ExitedThreadMethod,
    {
      threadId: number;
    }
  >(ExitedThreadMessage.method);
}
