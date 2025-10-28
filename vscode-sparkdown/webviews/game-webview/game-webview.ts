import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { GamePreviewedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GamePreviewedMessage";
import { GameResizedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import { installWorkspaceWorker } from "@impower/spark-web-player/src/main/workers/installWorkspaceWorker";

console.log("running game-webview");

declare var acquireVsCodeApi: any;

const state: {
  textDocument: { uri: string };
  canvasHeight?: number;
} = {
  textDocument: { uri: "" },
  canvasHeight: undefined,
};

const vscode = acquireVsCodeApi();

const workspaceState = installWorkspaceWorker((message, transfer) =>
  vscode.postMessage(message)
);

window.addEventListener("message", async (e: MessageEvent) => {
  const message = e.data;
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

window.addEventListener(MessageProtocol.event, (e) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      // Forward responses and notifications from player to vscode extension
      vscode.postMessage(message);
      if (GamePreviewedMessage.type.isNotification(message)) {
        document.body.classList.add("ready");
      }
    }
    if (GameResizedMessage.type.isNotification(message)) {
      // Save canvas height so it can be restored after vscode is shut down
      const { height } = message.params;
      state.canvasHeight = height;
      vscode.setState(state);
    }
  }
});

const load = async () => {
  await Promise.allSettled([
    SparkWebPlayer.init({ workspace: workspaceState.workspace }),
  ]);
};

load();
