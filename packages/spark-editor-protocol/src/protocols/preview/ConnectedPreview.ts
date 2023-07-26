import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ConnectedPreviewPreviewMethod = typeof ConnectedPreview.method;

export interface ConnectedPreviewParams {
  type: "game" | "screenplay";
}

export abstract class ConnectedPreview {
  static readonly method = "preview/connected";
  static readonly type = new MessageProtocolNotificationType<
    ConnectedPreviewPreviewMethod,
    ConnectedPreviewParams
  >(ConnectedPreview.method);
}
