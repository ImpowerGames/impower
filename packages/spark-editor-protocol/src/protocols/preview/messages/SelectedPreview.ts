import {
  NotificationMessage,
  Range,
  TextDocumentIdentifier,
} from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type SelectedPreviewMethod = typeof SelectedPreview.type.method;

export interface SelectedPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  range: Range;
}

export interface SelectedPreviewNotificationMessage
  extends NotificationMessage<SelectedPreviewMethod, SelectedPreviewParams> {}

class SelectedPreviewProtocolType extends NotificationProtocolType<
  SelectedPreviewNotificationMessage,
  SelectedPreviewParams
> {
  method = "preview/selected";
}

export abstract class SelectedPreview {
  static readonly type = new SelectedPreviewProtocolType();
}
