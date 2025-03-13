import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SteppedMethod = typeof SteppedMessage.method;

export class SteppedMessage {
  static readonly method = "story/stepped";
  static readonly type = new MessageProtocolNotificationType<
    SteppedMethod,
    {
      location: DocumentLocation;
    }
  >(SteppedMessage.method);
}
