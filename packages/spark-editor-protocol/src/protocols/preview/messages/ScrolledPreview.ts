import {
  NotificationMessage,
  Range,
  TextDocumentIdentifier,
} from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type ScrolledPreviewMethod = typeof ScrolledPreview.type.method;

export interface ScrolledPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface ScrolledPreviewNotificationMessage
  extends NotificationMessage<ScrolledPreviewMethod, ScrolledPreviewParams> {}

class ScrolledPreviewProtocolType extends NotificationProtocolType<
  ScrolledPreviewNotificationMessage,
  ScrolledPreviewParams
> {
  method = "preview/scrolled";
}

export abstract class ScrolledPreview {
  static readonly type = new ScrolledPreviewProtocolType();
}
