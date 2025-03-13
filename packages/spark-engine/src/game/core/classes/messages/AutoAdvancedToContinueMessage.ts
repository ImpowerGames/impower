import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type AutoAdvancedToContinueMethod =
  typeof AutoAdvancedToContinueMessage.method;

export class AutoAdvancedToContinueMessage {
  static readonly method = "story/autoAdvancedToContinue";
  static readonly type = new MessageProtocolNotificationType<
    AutoAdvancedToContinueMethod,
    {
      location: DocumentLocation;
    }
  >(AutoAdvancedToContinueMessage.method);
}
