import { DocumentLocation } from "../../types/DocumentLocation";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type PreviewedMethod = typeof PreviewedMessage.method;

export class PreviewedMessage {
  static readonly method = "story/previewed";
  static readonly type = new MessageProtocolNotificationType<
    PreviewedMethod,
    {
      location: DocumentLocation;
      path: string;
    }
  >(PreviewedMessage.method);
}
