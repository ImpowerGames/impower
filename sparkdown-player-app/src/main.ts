import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DragFilesEnterMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesEnterMessage";
import { DragFilesLeaveMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesLeaveMessage";
import { DragFilesOverMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesOverMessage";
import { DropFilesMessage } from "@impower/spark-editor-protocol/src/protocols/window/DropFilesMessage";
import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import "./style.css";

const SPARKDOWN_EDITOR_ORIGIN = import.meta.env.VITE_SPARKDOWN_EDITOR_ORIGIN;

window.addEventListener("message", (e) => {
  if (e.origin !== SPARKDOWN_EDITOR_ORIGIN) {
    return;
  }
  const message = e.data;
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
    message.result?.transfer || message.params?.transfer
  );
});
window.addEventListener(MessageProtocol.event, (e) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      // Forward responses and notifications from player to editor
      window.parent.postMessage(
        message,
        SPARKDOWN_EDITOR_ORIGIN,
        message.result?.transfer || message.params?.transfer
      );
    }
  }
});
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.parent.postMessage(
    DragFilesEnterMessage.type.request({}),
    SPARKDOWN_EDITOR_ORIGIN
  );
});
window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.parent.postMessage(
    DragFilesLeaveMessage.type.request({}),
    SPARKDOWN_EDITOR_ORIGIN
  );
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.parent.postMessage(
    DragFilesOverMessage.type.request({}),
    SPARKDOWN_EDITOR_ORIGIN
  );
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
  window.parent.postMessage(
    DropFilesMessage.type.request({ files }),
    SPARKDOWN_EDITOR_ORIGIN,
    files.map((f) => f.buffer)
  );
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { type: "module" })
    .catch((err) => console.error("SW register failed:", err));
}
navigator.serviceWorker.addEventListener("message", (e) => {
  const message = e.data;
  // Forward protocol messages from service worker to editor
  window.parent.postMessage(
    message,
    SPARKDOWN_EDITOR_ORIGIN,
    message.result?.transfer || message.params?.transfer
  );
});

const load = async () => {
  await Promise.allSettled([SparkWebPlayer.init()]);
};

load();
