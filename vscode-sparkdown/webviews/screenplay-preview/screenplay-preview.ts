import {
  ConnectedPreviewNotification,
  HoveredOffPreviewNotification,
  HoveredOnPreviewNotification,
  LoadedPreviewNotification,
  ScrolledPreviewNotification,
  SelectedPreviewNotification,
} from "@impower/spark-editor-protocol/src/index.js";
import SparkdownScriptPreview from "@impower/sparkdown-script-views/src/modules/preview/index.js";

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

const load = async () => {
  await Promise.allSettled([SparkdownScriptPreview.init()]);
};
load();

window.addEventListener("message", (e: MessageEvent) => {
  if (ConnectedPreviewNotification.is(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (LoadedPreviewNotification.is(e.data)) {
    if (e.data.params.type === "screenplay") {
      document.body.classList.add("ready");
      vscode.setState({ textDocument: e.data.params.textDocument });
      vscode.postMessage(e.data);
    }
  }
  if (ScrolledPreviewNotification.is(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (SelectedPreviewNotification.is(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (HoveredOnPreviewNotification.is(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
  if (HoveredOffPreviewNotification.is(e.data)) {
    if (e.data.params.type === "screenplay") {
      vscode.postMessage(e.data);
    }
  }
});
