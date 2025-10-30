import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { isMessage } from "@impower/jsonrpc/src/common/utils/isMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DragFilesEnterMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesEnterMessage";
import { DragFilesLeaveMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesLeaveMessage";
import { DragFilesOverMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesOverMessage";
import { DropFilesMessage } from "@impower/spark-editor-protocol/src/protocols/window/DropFilesMessage";
import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import { installWorkspaceWorker } from "@impower/spark-web-player/src/main/workers/installWorkspaceWorker";
import "./style.css";

const SPARKDOWN_EDITOR_ORIGIN = import.meta.env.VITE_SPARKDOWN_EDITOR_ORIGIN;

const connection = new Port2MessageConnection(
  (message: any, transfer?: Transferable[]) =>
    window.parent.postMessage(message, SPARKDOWN_EDITOR_ORIGIN, transfer),
  SPARKDOWN_EDITOR_ORIGIN
);
connection.listen();

connection.addEventListener("message", async (e) => {
  const message = e.data;
  if (isMessage(message)) {
    // Forward protocol messages from editor to player
    window.dispatchEvent(
      new CustomEvent(MessageProtocol.event, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: message,
      })
    );
    // Forward protocol responses and notifications from editor to service worker
    navigator.serviceWorker.controller?.postMessage(
      message,
      (message as any).result?.transfer || (message as any).params?.transfer
    );
  }
});

const workspaceState = installWorkspaceWorker(connection);

window.addEventListener(MessageProtocol.event, (e) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      // Forward responses and notifications from player to editor
      connection.postMessage(
        message,
        message.result?.transfer || message.params?.transfer
      );
    }
  }
});
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  e.stopPropagation();
  connection.postMessage(DragFilesEnterMessage.type.request({}));
});
window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  connection.postMessage(DragFilesLeaveMessage.type.request({}));
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  connection.postMessage(DragFilesOverMessage.type.request({}));
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const files = await Promise.all(
    Array.from(e.dataTransfer?.files || []).map(async (f) => {
      const name = f.name;
      const buffer = await f.arrayBuffer();
      return {
        name,
        buffer,
      };
    })
  );
  connection.postMessage(
    DropFilesMessage.type.request({ files }),
    files.map((f) => f.buffer)
  );
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { type: "module" })
    .catch((err) => console.error("SW register failed:", err));

  navigator.serviceWorker.addEventListener("message", (e) => {
    const message = e.data;
    // Forward protocol messages from service worker to editor
    connection.postMessage(
      message,
      message.result?.transfer || message.params?.transfer
    );
  });
}

const load = async () => {
  await Promise.allSettled([
    SparkWebPlayer.init({ workspace: workspaceState.workspace }),
  ]);
};

load();
