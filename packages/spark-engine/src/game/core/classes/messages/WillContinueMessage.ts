import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type WillContinueMethod = typeof WillContinueMessage.method;

export class WillContinueMessage {
  static readonly method = "story/willContinue";
  static readonly type = new MessageProtocolNotificationType<
    WillContinueMethod,
    {
      location: DocumentLocation;
      path: string;
    }
  >(WillContinueMessage.method);
}
