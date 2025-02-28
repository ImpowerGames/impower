import { ConnectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ConnectedPreviewMessage";
import { HoveredOffPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOffPreviewMessage";
import { HoveredOnPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/HoveredOnPreviewMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { ScrolledPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ScrolledPreviewMessage";
import { SelectedPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SelectedPreviewMessage";
import SparkGamePreview from "@impower/spark-web-player/src/index.js";

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
        if (message.id === loadingRequest) {
          if (message.params.type === "game") {
            document.body.classList.add("ready");
            vscode.postMessage(message);
          }
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

const emit = <T>(eventName: string, detail?: T): boolean => {
  return window.dispatchEvent(
    new CustomEvent(eventName, {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail,
    })
  );
};

window.addEventListener("message", (e: MessageEvent) => {
  const message = e.data;
  if (LoadPreviewMessage.type.isRequest(message)) {
    if (message.params.type === "game") {
      loadingRequest = message.id;
      vscode.setState({
        textDocument: { uri: message.params.textDocument.uri },
      });
    }
  }
  // Forward MessageEvents from vscode extension to web components as CustomEvents
  emit(message.method, message);
});

load();
