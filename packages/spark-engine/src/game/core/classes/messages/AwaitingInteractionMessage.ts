import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type AwaitingInteractionMethod =
  typeof AwaitingInteractionMessage.method;

export class AwaitingInteractionMessage {
  static readonly method = "story/awaitingInteraction";
  static readonly type = new MessageProtocolNotificationType<
    AwaitingInteractionMethod,
    {
      location: DocumentLocation;
    }
  >(AwaitingInteractionMessage.method);
}
