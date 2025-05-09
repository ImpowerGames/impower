import { Range, TextDocumentIdentifier } from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type SelectedPreviewMethod = typeof SelectedPreviewMessage.method;

export interface SelectedPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
  selectedRange: Range;
  docChanged: boolean;
  userEvent?: boolean;
}

export class SelectedPreviewMessage {
  static readonly method = "preview/selected";
  static readonly type = new MessageProtocolNotificationType<
    SelectedPreviewMethod,
    SelectedPreviewParams
  >(SelectedPreviewMessage.method);
}

export namespace SelectedPreviewMessage {
  export interface Notification
    extends NotificationMessage<SelectedPreviewMethod, SelectedPreviewParams> {}
}
