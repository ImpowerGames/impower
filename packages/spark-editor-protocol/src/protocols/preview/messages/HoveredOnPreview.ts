import { NotificationMessage, TextDocumentIdentifier } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type HoveredOnPreviewMethod = typeof HoveredOnPreview.type.method;

export interface HoveredOnPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export interface HoveredOnPreviewNotificationMessage
  extends NotificationMessage<HoveredOnPreviewMethod, HoveredOnPreviewParams> {}

class HoveredOnPreviewProtocolType extends NotificationProtocolType<
  HoveredOnPreviewNotificationMessage,
  HoveredOnPreviewParams
> {
  method = "preview/hoveredOn";
}

export abstract class HoveredOnPreview {
  static readonly type = new HoveredOnPreviewProtocolType();
}
