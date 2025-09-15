import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import { MessageProtocol } from "../../packages/spark-editor-protocol/src/protocols/MessageProtocol";
import "./style.css";

const SPARKDOWN_EDITOR_ORIGIN = import.meta.env.VITE_SPARKDOWN_EDITOR_ORIGIN;

const load = async () => {
  await Promise.allSettled([SparkWebPlayer.init()]);
};

load();

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
