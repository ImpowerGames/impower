import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";

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
