import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import SparkGamePreview from "@impower/spark-web-player/src/index.js";

console.log("running game-webview");

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

const load = async () => {
  // Forward protocol messages from window to vscode extension
  window.addEventListener(MessageProtocol.event, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      vscode.postMessage(message);
      if (LoadPreviewMessage.type.is(message)) {
        document.body.classList.add("ready");
      }
    }
  });
  await Promise.allSettled([SparkGamePreview.init()]);
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
