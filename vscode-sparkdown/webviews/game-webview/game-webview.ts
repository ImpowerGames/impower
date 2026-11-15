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
  whenControllerListening,
} from "@impower/spark-web-player/src/index.js";
import { installWorkspaceWorker } from "@impower/spark-web-player/src/main/workers/installWorkspaceWorker";
import { previewedDocumentUri } from "./previewedDocumentUri";
import { revealsPreview } from "./revealsPreview";
import {
  replayBeatShortcut,
  systemMotionReport,
} from "../../src/utils/gamePreviewWebview";

console.log("running game-webview");

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

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

const workspaceState = installWorkspaceWorker(
  connection,
  whenControllerListening(),
);

connection.addEventListener("message", async (e: MessageEvent) => {
  const message = e.data;
  if (isMessage(message)) {
    sendProtocolMessage(message);
  }
  const uri = previewedDocumentUri(message);
  if (uri) {
    state.textDocument.uri = uri;
    vscode.setState(state);
  }
});

window.addEventListener(MessageProtocol.event, (e) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      if (isMessage(message)) {
        connection.postMessage(message);
      }
      if (revealsPreview(message)) {
        document.body.classList.add("ready");
      }
    }
    if (GameResizedMessage.type.isNotification(message)) {
      const { height, fit } = message.params;
      const canvasHeight = fit === "height" ? height : undefined;
      if (canvasHeight !== state.canvasHeight) {
        state.canvasHeight = canvasHeight;
        vscode.setState(state);
      }
    }
  }
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const reportMotion = () =>
  vscode.postMessage(systemMotionReport(reducedMotion.matches));
reducedMotion.addEventListener("change", reportMotion);

const load = async () => {
  setWorkspace(workspaceState.workspace);
  document
    .querySelector("spark-web-player")
    ?.setAttribute("replay-shortcut", replayBeatShortcut(navigator.userAgent));
  vscode.postMessage({});
  reportMotion();
  await Promise.allSettled([SparkWebPlayerElement.register()]);
};

load();
