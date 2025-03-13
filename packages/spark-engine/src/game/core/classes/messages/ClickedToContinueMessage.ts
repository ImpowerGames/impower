import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ClickedToContinueMethod = typeof ClickedToContinueMessage.method;

export class ClickedToContinueMessage {
  static readonly method = "story/clickedToContinue";
  static readonly type = new MessageProtocolNotificationType<
    ClickedToContinueMethod,
    {
      location: DocumentLocation;
    }
  >(ClickedToContinueMessage.method);
}
