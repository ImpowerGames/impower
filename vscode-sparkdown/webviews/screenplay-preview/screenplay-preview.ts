import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage.js";
import { HoveredOffPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage.js";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage.js";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage.js";
import { SelectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage.js";
import SparkdownScriptPreview from "@impower/sparkdown-script-views/src/modules/preview/index.js";

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

const load = async () => {
  await Promise.allSettled([SparkdownScriptPreview.init()]);
};
load();

let loadingRequest: number | string | undefined = undefined;

window.addEventListener("message", (e: MessageEvent) => {
  if (ConnectedPreviewMessage.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (LoadPreviewMessage.type.isRequest(e.data)) {
    if (e.data.params.type === "screenplay") {
      loadingRequest = e.data.id;
      vscode.setState({ textDocument: e.data.params.textDocument });
    }
  }
  if (LoadPreviewMessage.type.isResponse(e.data)) {
    if (e.data.id === loadingRequest) {
      document.body.classList.add("ready");
      vscode.postMessage(e.data);
    }
  }
  if (ScrolledPreviewMessage.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (SelectedPreviewMessage.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (HoveredOnPreviewMessage.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (HoveredOffPreviewMessage.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
});
