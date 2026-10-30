import type * as LSP from "../../types";
import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type PreviewCompletionMethod = typeof PreviewCompletionMessage.method;

export interface PreviewCompletionParams {
  textDocument: LSP.VersionedTextDocumentIdentifier;
  session: number;
  request: number;
  state: "focus" | "close";
  contentChanges?: LSP.TextDocumentContentChangeEvent[] | null;
  selectedRange?: LSP.Range;
  accepted?: {
    version: number;
    contentChanges: LSP.TextDocumentContentChangeEvent[];
  };
}

export class PreviewCompletionMessage {
  static readonly method = "textDocument/previewCompletion";
  static readonly type = new MessageProtocolNotificationType<
    PreviewCompletionMethod,
    PreviewCompletionParams
  >(PreviewCompletionMessage.method);
}

export namespace PreviewCompletionMessage {
  export interface Notification extends NotificationMessage<
    PreviewCompletionMethod,
    PreviewCompletionParams
  > {}
}
