import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidExpandPreviewPaneMethod =
  typeof DidExpandPreviewPaneMessage.method;

export interface DidExpandPreviewPaneParams {}

export namespace DidExpandPreviewPaneMessage {
  export const method = "window/didExpandPreviewPane";
  export const type = new MessageProtocolNotificationType<
    DidExpandPreviewPaneMethod,
    DidExpandPreviewPaneParams
  >(DidExpandPreviewPaneMessage.method);
}
