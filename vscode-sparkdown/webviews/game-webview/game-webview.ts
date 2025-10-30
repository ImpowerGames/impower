import { WindowMessageConnection } from "@impower/jsonrpc/src/browser/classes/WindowMessageConnection";
import { isMessage } from "@impower/jsonrpc/src/common/utils/isMessage";
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

const connection = new WindowMessageConnection((message: any) =>
  vscode.postMessage(message)
);
connection.listen();

const workspaceState = installWorkspaceWorker(connection);

connection.addEventListener("message", async (e: MessageEvent) => {
  const message = e.data;
  if (isMessage(message)) {
    // Forward protocol messages from vscode extension to window
    window.dispatchEvent(
      new CustomEvent(MessageProtocol.event, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: message,
      })
    );
  }
});

window.addEventListener(MessageProtocol.event, (e) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      if (isMessage(message)) {
        // Forward responses and notifications from player to vscode extension
        connection.postMessage(message);
      }
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
  // Post an empty message to let vscode know the webview is ready
  vscode.postMessage({});
};

load();
