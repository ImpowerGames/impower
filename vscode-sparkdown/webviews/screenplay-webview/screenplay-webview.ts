import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { SparkdownScreenplayPreviewElement } from "@impower/sparkdown-document-views/src/modules/screenplay-preview/SparkdownScreenplayPreview.elem";
import impowerUiCss from "./impower-ui-utilities.css?tw";

console.log("running screenplay-webview v1.0");

const impowerUiStyle = document.createElement("style");
impowerUiStyle.textContent = impowerUiCss;
document.head.appendChild(impowerUiStyle);

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

window.addEventListener("message", (e: MessageEvent) => {
  const message = e.data;
  if (LoadPreviewMessage.type.isRequest(message)) {
    vscode.setState({
      textDocument: { uri: message.params.textDocument.uri },
    });
  }
  sendProtocolMessage(message);
});

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

const load = async () => {
  await Promise.allSettled([SparkdownScreenplayPreviewElement.register()]);
};

load();
