import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ConnectedPreviewPreviewMethod =
  typeof ConnectedPreviewMessage.method;

export interface ConnectedPreviewParams {
  type: "game" | "screenplay";
}

export abstract class ConnectedPreviewMessage {
  static readonly method = "preview/connected";
  static readonly type = new MessageProtocolNotificationType<
    ConnectedPreviewPreviewMethod,
    ConnectedPreviewParams
  >(ConnectedPreviewMessage.method);
}
