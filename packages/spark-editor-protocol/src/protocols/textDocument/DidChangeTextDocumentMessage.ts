import type * as LSP from "../../types";
import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeTextDocumentMethod =
  typeof DidChangeTextDocumentMessage.method;

export type DidChangeTextDocumentParams = LSP.DidChangeTextDocumentParams & {
  /** When the editor made the change, by `Date.now()`. Not LSP's: a
   *  receiver that debounces work on edits counts from it, since the
   *  message can arrive well after the key that made the change (#1881). */
  changedAt?: number;
  /** The selection the change leaves, when it sets one, as the
   *  `textDocument/didSelect` the editor sends after it gives it, so a
   *  receiver need not wait for that to know where the edit left the
   *  author (#1881). Not LSP's. */
  selection?: { selectedRange: LSP.Range; userEvent?: boolean };
};

export class DidChangeTextDocumentMessage {
  static readonly method = "textDocument/didChange";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  >(DidChangeTextDocumentMessage.method);
}

export namespace DidChangeTextDocumentMessage {
  export interface Notification extends NotificationMessage<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  > {}
}
