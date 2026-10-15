import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";

/**
 * The script the preview shows from now on, when `message` from the extension
 * changes it, so the webview can save it for VS Code to restore the panel
 * with when the workspace reopens (#1886): the script the player is
 * initialized with, then each script the author selects a line in, which
 * the player previews from (the extension reports selections only while the
 * preview follows the cursor). Undefined for any other message.
 */
export const previewedDocumentUri = (message: unknown): string | undefined => {
  if (InitializeMessage.type.isRequest(message)) {
    return message.params.initializationOptions?.uri || undefined;
  }
  if (
    DidSelectTextDocumentMessage.type.isNotification(message) &&
    message.params.userEvent
  ) {
    return message.params.textDocument.uri || undefined;
  }
  return undefined;
};
