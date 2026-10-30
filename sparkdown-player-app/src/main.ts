import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { isMessage } from "@impower/jsonrpc/src/common/utils/isMessage";
import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DraggedFilesInMessage } from "@impower/spark-editor-protocol/src/protocols/window/DraggedFilesInMessage";
import { DraggedFilesOutMessage } from "@impower/spark-editor-protocol/src/protocols/window/DraggedFilesOutMessage";
import { DraggedFilesOverMessage } from "@impower/spark-editor-protocol/src/protocols/window/DraggedFilesOverMessage";
import { DroppedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/window/DroppedFilesMessage";
import {
  SparkWebPlayerElement,
  setWorkspace,
} from "@impower/spark-web-player/src/index.js";
import { installWorkspaceWorker } from "@impower/spark-web-player/src/main/workers/installWorkspaceWorker";
import { enableOnsetTap } from "@impower/spark-web-player/src/app/managers/AudioProbe";
import "./style.css";

const SPARKDOWN_EDITOR_ORIGIN = import.meta.env.VITE_SPARKDOWN_EDITOR_ORIGIN;

if (import.meta.env.DEV) {
  enableOnsetTap();
}

const IS_LOCALHOST = ["localhost", "127.0.0.1", "[::1]"].includes(
  window.location.hostname,
);

let replyTargetOrigin: string | undefined = IS_LOCALHOST
  ? SPARKDOWN_EDITOR_ORIGIN || "*"
  : SPARKDOWN_EDITOR_ORIGIN;
if (IS_LOCALHOST) {
  window.addEventListener("message", (e) => {
    if (
      e.source === window.parent &&
      typeof e.origin === "string" &&
      e.origin &&
      e.origin !== "null"
    ) {
      replyTargetOrigin = e.origin;
    }
  });
}

const SAME_ORIGIN = window.location.origin === SPARKDOWN_EDITOR_ORIGIN;

const SAME_ORIGIN_PROXY = import.meta.env.BASE_URL.startsWith("/__player");

const connection = new Port2MessageConnection(
  (message: any, transfer?: Transferable[]) =>
    window.parent.postMessage(message, replyTargetOrigin || "*", transfer),
  IS_LOCALHOST ? undefined : SPARKDOWN_EDITOR_ORIGIN,
);
connection.listen();
console.log(
  `[sparkdown-player] ready — editor origin: ${
    IS_LOCALHOST ? "(dev) any localhost accepted" : SPARKDOWN_EDITOR_ORIGIN
  }`,
);

connection.addEventListener("message", async (e) => {
  const message = e.data;
  if (isMessage(message)) {
    sendProtocolMessage(message);
    if (
      !SAME_ORIGIN &&
      !SAME_ORIGIN_PROXY &&
      (message as any).id !== undefined &&
      ((message as any).result !== undefined ||
        (message as any).error !== undefined)
    ) {
      navigator.serviceWorker.controller?.postMessage(
        message,
        (message as any).result?.transfer || (message as any).params?.transfer,
      );
    }
  }
});

const workspaceState = installWorkspaceWorker(connection);

window.addEventListener(MessageProtocol.event, (e) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      connection.postMessage(
        message,
        message.result?.transfer || message.params?.transfer,
      );
    }
  }
});
const carriesFiles = (e: DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files");

window.addEventListener("dragenter", (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  connection.postMessage(DraggedFilesInMessage.type.notification({}));
});
window.addEventListener("dragleave", (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  connection.postMessage(DraggedFilesOutMessage.type.notification({}));
});
window.addEventListener("dragover", (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  connection.postMessage(DraggedFilesOverMessage.type.notification({}));
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
    }),
  );
  connection.postMessage(
    DroppedFilesMessage.type.notification({ files }),
    files.map((f) => f.buffer),
  );
});

if (!SAME_ORIGIN && !SAME_ORIGIN_PROXY && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { type: "module" })
    .catch((err) => console.error("SW register failed:", err));

  navigator.serviceWorker.addEventListener("message", (e) => {
    const message = e.data;
    connection.postMessage(
      message,
      message.result?.transfer || message.params?.transfer,
    );
  });
}

const load = async () => {
  setWorkspace(workspaceState.workspace);
  await Promise.allSettled([SparkWebPlayerElement.register()]);
};

load();
