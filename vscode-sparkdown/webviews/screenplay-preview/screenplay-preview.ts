import { ConnectedPreview } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreview.js";
import { HoveredOffPreview } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreview.js";
import { HoveredOnPreview } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreview.js";
import { LoadPreview } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreview.js";
import { ScrolledPreview } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreview.js";
import { SelectedPreview } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreview.js";
import SparkdownScriptPreview from "@impower/sparkdown-script-views/src/modules/preview/index.js";

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

const load = async () => {
  await Promise.allSettled([SparkdownScriptPreview.init()]);
};
load();

let loadingRequest: number | string | undefined = undefined;

window.addEventListener("message", (e: MessageEvent) => {
  if (ConnectedPreview.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (LoadPreview.type.isRequest(e.data)) {
    if (e.data.params.type === "screenplay") {
      loadingRequest = e.data.id;
      vscode.setState({ textDocument: e.data.params.textDocument });
    }
  }
  if (LoadPreview.type.isResponse(e.data)) {
    if (e.data.id === loadingRequest) {
      document.body.classList.add("ready");
      vscode.postMessage(e.data);
    }
  }
  if (ScrolledPreview.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (SelectedPreview.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (HoveredOnPreview.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (HoveredOffPreview.type.isNotification(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
});
