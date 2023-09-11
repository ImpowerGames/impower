import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCollapsePreviewPaneMethod =
  typeof DidCollapsePreviewPaneMessage.method;

export interface DidCollapsePreviewPaneParams {}

export class DidCollapsePreviewPaneMessage {
  static readonly method = "window/didCollapsePreviewPane";
  static readonly type = new MessageProtocolNotificationType<
    DidCollapsePreviewPaneMethod,
    DidCollapsePreviewPaneParams
  >(DidCollapsePreviewPaneMessage.method);
}
