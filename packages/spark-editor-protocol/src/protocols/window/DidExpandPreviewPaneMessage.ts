import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidExpandPreviewPaneMethod =
  typeof DidExpandPreviewPaneMessage.method;

export interface DidExpandPreviewPaneParams {}

export abstract class DidExpandPreviewPaneMessage {
  static readonly method = "window/didExpandPreviewPane";
  static readonly type = new MessageProtocolNotificationType<
    DidExpandPreviewPaneMethod,
    DidExpandPreviewPaneParams
  >(DidExpandPreviewPaneMessage.method);
}
