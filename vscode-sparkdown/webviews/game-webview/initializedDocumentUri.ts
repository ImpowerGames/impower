import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";

/**
 * The script the extension initializes the player with, when `message` is
 * that initialization, so the webview can save it for VS Code to restore the
 * panel with when the workspace reopens (#1886). Undefined for any other
 * message, and for an initialization without a script.
 */
export const initializedDocumentUri = (message: unknown): string | undefined =>
  InitializeMessage.type.isRequest(message)
    ? message.params.initializationOptions?.uri || undefined
    : undefined;
