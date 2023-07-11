import { NotificationMessage } from "../../base/NotificationMessage";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type HoveredOffPreviewMethod =
  typeof HoveredOffPreviewNotification.method;

export interface HoveredOffPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export interface HoveredOffPreviewMessage
  extends NotificationMessage<
    HoveredOffPreviewMethod,
    HoveredOffPreviewParams
  > {}

export class HoveredOffPreviewNotification {
  static readonly method = "preview/hoveredOff";
  static is(obj: any): obj is HoveredOffPreviewMessage {
    return obj.method === this.method;
  }
  static message(params: HoveredOffPreviewParams): HoveredOffPreviewMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
