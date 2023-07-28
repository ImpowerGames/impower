import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage.js";
import { HoveredOffPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage.js";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage.js";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage.js";
import { SelectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage.js";
import SparkGamePreview from "@impower/spark-game-preview/src/index.js";

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

let loadingRequest: number | string | undefined = undefined;

const load = async () => {
  window.addEventListener(ConnectedPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ConnectedPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  window.addEventListener(LoadPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadPreviewMessage.type.isRequest(message)) {
        if (message.params.type === "game") {
          loadingRequest = message.id;
          vscode.setState({ textDocument: message.params.textDocument });
        }
      }
    }
  });
  window.addEventListener(LoadPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (LoadPreviewMessage.type.isResponse(message)) {
        if (message.id === loadingRequest) {
          document.body.classList.add("ready");
          vscode.postMessage(message);
        }
      }
    }
  });
  window.addEventListener(ScrolledPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (ScrolledPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  window.addEventListener(SelectedPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (SelectedPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  window.addEventListener(HoveredOnPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (HoveredOnPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  window.addEventListener(HoveredOffPreviewMessage.method, (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (HoveredOffPreviewMessage.type.isNotification(message)) {
        if (message.params.type === "game") {
          vscode.postMessage(message);
        }
      }
    }
  });
  await Promise.allSettled([SparkGamePreview.init()]);
};
load();
