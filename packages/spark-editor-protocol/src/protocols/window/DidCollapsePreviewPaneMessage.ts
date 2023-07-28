import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCollapsePreviewPaneMethod =
  typeof DidCollapsePreviewPaneMessage.method;

export interface DidCollapsePreviewPaneParams {}

export namespace DidCollapsePreviewPaneMessage {
  export const method = "window/didCollapsePreviewPane";
  export const type = new MessageProtocolNotificationType<
    DidCollapsePreviewPaneMethod,
    DidCollapsePreviewPaneParams
  >(DidCollapsePreviewPaneMessage.method);
}
