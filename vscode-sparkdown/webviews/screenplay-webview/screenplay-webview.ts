import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import SparkdownScriptPreview from "@impower/sparkdown-document-views/src/modules/screenplay-preview/index.js";

console.log("running screenplay-webview");

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

const load = async () => {
  // Forward protocol messages from window to vscode extension
  window.addEventListener(MessageProtocol.event, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (e.target !== window) {
        vscode.postMessage(message);
        if (LoadPreviewMessage.type.isResponse(message)) {
          document.body.classList.add("ready");
        }
      }
    }
  });
  await Promise.allSettled([SparkdownScriptPreview.init()]);
};

window.addEventListener("message", (e: MessageEvent) => {
  const message = e.data;
  if (LoadPreviewMessage.type.isRequest(message)) {
    vscode.setState({
      textDocument: { uri: message.params.textDocument.uri },
    });
  }
  // Forward protocol messages from vscode extension to window
  window.dispatchEvent(
    new CustomEvent(MessageProtocol.event, {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: message,
    })
  );
});

load();
