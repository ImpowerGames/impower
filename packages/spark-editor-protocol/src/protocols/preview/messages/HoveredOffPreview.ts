import { NotificationMessage, TextDocumentIdentifier } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type HoveredOffPreviewMethod = typeof HoveredOffPreview.type.method;

export interface HoveredOffPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export interface HoveredOffPreviewNotificationMessage
  extends NotificationMessage<
    HoveredOffPreviewMethod,
    HoveredOffPreviewParams
  > {}

class HoveredOffPreviewProtocolType extends NotificationProtocolType<
  HoveredOffPreviewNotificationMessage,
  HoveredOffPreviewParams
> {
  method = "preview/hoveredOff";
}

export abstract class HoveredOffPreview {
  static readonly type = new HoveredOffPreviewProtocolType();
}
