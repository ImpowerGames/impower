import type * as LSP from "../../types";
import type { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type PreviewCompletionMethod = typeof PreviewCompletionMessage.method;

/**
 * An editor's autocomplete list highlighted an option, or closed.
 *
 * The editor sends one of these for every newly highlighted option (including
 * the first one, and a return to an option highlighted before) and one when
 * the list closes. It never classifies whether an option could change what the
 * preview shows: every option is a request, and the preview decides.
 *
 * Nothing about the request touches the real document. The edit travels only
 * here, as the changes accepting the option would make, and the preview
 * applies them to a private copy of the document for as long as the option is
 * highlighted.
 */
export interface PreviewCompletionParams {
  /** The real document, at the version the edit is relative to. */
  textDocument: LSP.VersionedTextDocumentIdentifier;
  /** Identifies one opening of the list in this editor. A new opening gets a
   *  new session, so a late answer to an old one can be told apart. */
  session: number;
  /** Increases with every notification the editor sends, across sessions. */
  request: number;
  /** `focus`: an option is highlighted. `close`: the list closed. */
  state: "focus" | "close";
  /** `focus` only. The changes accepting the highlighted option would make,
   *  against the document at `textDocument.version`, in the order
   *  `textDocument/didChange` applies them. `null` when the editor cannot
   *  work out what accepting would insert; the preview then reports the
   *  option as unavailable rather than guessing. */
  contentChanges?: LSP.TextDocumentContentChangeEvent[] | null;
  /** `focus` only. Where the author is: the preview shows this line of the
   *  hypothetical document, as it shows the cursor's line of the real one. */
  selectedRange?: LSP.Range;
  /** `close` only, when the list closed because an option was accepted: the
   *  edit acceptance made, as the version it applied to and the changes it
   *  made, so the preview can tell whether the frame on screen already shows
   *  the document the edit produced. `textDocument.version` is then the
   *  version after it. */
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
