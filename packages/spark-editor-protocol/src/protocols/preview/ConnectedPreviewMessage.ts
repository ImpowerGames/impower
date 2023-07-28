import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type ConnectedPreviewPreviewMethod =
  typeof ConnectedPreviewMessage.method;

export interface ConnectedPreviewParams {
  type: "game" | "screenplay";
}

export namespace ConnectedPreviewMessage {
  export const method = "preview/connected";
  export const type = new MessageProtocolNotificationType<
    ConnectedPreviewPreviewMethod,
    ConnectedPreviewParams
  >(ConnectedPreviewMessage.method);
}
