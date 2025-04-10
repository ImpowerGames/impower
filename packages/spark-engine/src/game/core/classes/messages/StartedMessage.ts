import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type StartedMethod = typeof StartedMessage.method;

export class StartedMessage {
  static readonly method = "story/started";
  static readonly type = new MessageProtocolNotificationType<StartedMethod, {}>(
    StartedMessage.method
  );
}
