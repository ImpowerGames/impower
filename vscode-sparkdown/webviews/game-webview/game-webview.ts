import { WindowMessageConnection } from "@impower/jsonrpc/src/browser/classes/WindowMessageConnection";
import { isMessage } from "@impower/jsonrpc/src/common/utils/isMessage";
import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { GameResizedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import {
  SparkWebPlayerElement,
  setWorkspace,
} from "@impower/spark-web-player/src/index.js";
import { installWorkspaceWorker } from "@impower/spark-web-player/src/main/workers/installWorkspaceWorker";
import { previewedDocumentUri } from "./previewedDocumentUri";
import { revealsPreview } from "./revealsPreview";

console.log("running game-webview");

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

// What a panel vscode restores is handed. Starts from what was saved before,
// so saving one field does not drop the other until it is reported again.
const saved = vscode.getState();
const state: {
  textDocument: { uri: string };
  canvasHeight?: number;
} = {
  textDocument: { uri: saved?.textDocument?.uri ?? "" },
  canvasHeight: saved?.canvasHeight,
};

const connection = new WindowMessageConnection((message: any) =>
  vscode.postMessage(message),
);
connection.listen();

const workspaceState = installWorkspaceWorker(connection);

connection.addEventListener("message", async (e: MessageEvent) => {
  const message = e.data;
  if (isMessage(message)) {
    // Forward protocol messages from vscode extension to window
    sendProtocolMessage(message);
  }
  const uri = previewedDocumentUri(message);
  if (uri) {
    // Save the script the preview shows so a panel vscode restores resumes
    // it (#1886)
    state.textDocument.uri = uri;
    vscode.setState(state);
  }
});

// Stays a raw bus listener (not the typed `onProtocolMessage` helper): it
// relays every message bubbling up from the player (`e.target !== window`) to
// the vscode extension, discriminating on target rather than message type.
window.addEventListener(MessageProtocol.event, (e) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      if (isMessage(message)) {
        // Forward responses and notifications from player to vscode extension
        connection.postMessage(message);
      }
      if (revealsPreview(message)) {
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
  setWorkspace(workspaceState.workspace);
  // Post an empty message to let vscode know this webview's script has
  // loaded, before the player is registered: the player announces itself
  // once it has mounted, through this same channel, so the extension always
  // hears this first and can let go of an initialization still under way
  // for the webview this one replaced (#1874).
  vscode.postMessage({});
  await Promise.allSettled([SparkWebPlayerElement.register()]);
};

load();
