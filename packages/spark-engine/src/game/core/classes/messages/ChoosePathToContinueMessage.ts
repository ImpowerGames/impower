import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ChosePathToContinueMethod =
  typeof ChosePathToContinueMessage.method;

export class ChosePathToContinueMessage {
  static readonly method = "story/chosePathToContinue";
  static readonly type = new MessageProtocolNotificationType<
    ChosePathToContinueMethod,
    {
      location: DocumentLocation;
    }
  >(ChosePathToContinueMessage.method);
}
