import { Message } from "../Message";

export interface ConnectedScreenplayPreviewParams {}

export type ConnectedScreenplayPreviewPreviewMethod =
  typeof ConnectedScreenplayPreview.method;

export interface ConnectedScreenplayPreviewMessage
  extends Message<
    ConnectedScreenplayPreviewPreviewMethod,
    ConnectedScreenplayPreviewParams
  > {}

export class ConnectedScreenplayPreview {
  static readonly method = "preview/screenplay/connected";
  static is(obj: any): obj is ConnectedScreenplayPreviewMessage {
    return obj.method === this.method;
  }
  static message(
    params: ConnectedScreenplayPreviewParams
  ): ConnectedScreenplayPreviewMessage {
    return {
      method: this.method,
      params,
    };
  }
}
