import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ExecutedMethod = typeof ExecutedMessage.method;

export class ExecutedMessage {
  static readonly method = "story/executed";
  static readonly type = new MessageProtocolNotificationType<
    ExecutedMethod,
    {
      locations: DocumentLocation[];
      path: string;
      state: "initial" | "running" | "previewing" | "paused";
      restarted?: boolean;
    }
  >(ExecutedMessage.method);
}
