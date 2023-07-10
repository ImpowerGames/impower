import { NotificationMessage } from "../../base/NotificationMessage";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type HoveredOnPreviewMethod = typeof HoveredOnPreviewNotification.method;

export interface HoveredOnPreviewParams {
  textDocument: TextDocumentIdentifier;
}

export interface HoveredOnPreviewMessage
  extends NotificationMessage<HoveredOnPreviewMethod, HoveredOnPreviewParams> {}

export class HoveredOnPreviewNotification {
  static readonly method = "preview/hoveredOn";
  static is(obj: any): obj is HoveredOnPreviewMessage {
    return obj.method === this.method;
  }
  static message(params: HoveredOnPreviewParams): HoveredOnPreviewMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
