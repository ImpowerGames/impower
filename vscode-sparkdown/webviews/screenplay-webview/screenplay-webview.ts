import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { SparkdownScreenplayPreviewElement } from "@impower/sparkdown-document-views/src/modules/screenplay-preview/SparkdownScreenplayPreview.elem";
// Build-time-compiled impower-ui utilities (see impower-ui-utilities.css + the
// `?tw` loader in esbuild.js). impower-dev gets these from its global Vite
// stylesheet; this webview has none, so inject them so LoadingBar renders styled.
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
  // Forward protocol messages from vscode extension to window
  sendProtocolMessage(message);
});

// Stays a raw bus listener (not the typed `onProtocolMessage` helper): it
// relays every message bubbling up from the preview (`e.target !== window`) to
// the vscode extension, discriminating on target rather than message type.
window.addEventListener(MessageProtocol.event, (e: Event) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      // Forward responses and notifications from window to vscode extension
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
