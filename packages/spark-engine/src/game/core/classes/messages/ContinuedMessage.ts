import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ContinuedMethod = typeof ContinuedMessage.method;

export class ContinuedMessage {
  static readonly method = "story/continued";
  static readonly type = new MessageProtocolNotificationType<
    ContinuedMethod,
    {
      location: DocumentLocation;
    }
  >(ContinuedMessage.method);
}
