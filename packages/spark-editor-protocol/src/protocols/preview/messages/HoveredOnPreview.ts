import { TextDocumentIdentifier } from "../../../types";
import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type HoveredOnPreviewMethod = typeof HoveredOnPreview.method;

export interface HoveredOnPreviewParams {
  type: "game" | "screenplay";
  textDocument: TextDocumentIdentifier;
}

export abstract class HoveredOnPreview {
  static readonly method = "preview/hoveredOn";
  static readonly type = new MessageProtocolNotificationType<
    HoveredOnPreviewMethod,
    HoveredOnPreviewParams
  >(HoveredOnPreview.method);
}
