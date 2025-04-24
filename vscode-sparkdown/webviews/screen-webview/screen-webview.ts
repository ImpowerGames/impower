import SparkdownScreenPreview from "@impower/sparkdown-screen-preview/src/index.js";

console.log("running screen-webview");

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

const state: {
  textDocument?: { uri: string };
  openPaths?: string[];
} = {};

window.addEventListener("message", (e) => {
  const message = e.data;
  if (message.method === "load") {
    const { textDocument } = message.params;
    state.textDocument = textDocument;
    vscode.setState(state);
  }
  // Forward all messages from vscode extension to window
  window.dispatchEvent(
    new CustomEvent("jsonrpc", {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: message,
    })
  );
});

// Forward responses and notifications from window to vscode extension
window.addEventListener("jsonrpc", (e: Event) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      if (message.method === "state") {
        const { openPaths } = message.params;
        if (openPaths) {
          state.openPaths = openPaths;
        }
        vscode.setState(state);
      }
      vscode.postMessage(message);
    }
  }
});

const load = async () => {
  await Promise.allSettled([SparkdownScreenPreview.init()]);
  vscode.postMessage({ method: "initialized" });
};

load();
