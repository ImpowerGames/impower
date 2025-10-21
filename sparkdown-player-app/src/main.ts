import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DragFilesEnterMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesEnterMessage";
import { DragFilesLeaveMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesLeaveMessage";
import { DragFilesOverMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesOverMessage";
import { DropFilesMessage } from "@impower/spark-editor-protocol/src/protocols/window/DropFilesMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { ExecuteCommandMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import "./style.css";

const SPARKDOWN_EDITOR_ORIGIN = import.meta.env.VITE_SPARKDOWN_EDITOR_ORIGIN;

const sendRequest = async <M extends string, P, R>(
  type: MessageProtocolRequestType<M, P, R>,
  params: P
): Promise<R> => {
  const request = type.request(params);
  return new Promise<R>((resolve, reject) => {
    const onResponse = (e: MessageEvent) => {
      const message = e.data;
      if (message.id === request.id) {
        if (message.error !== undefined) {
          reject(message.error);
          window.removeEventListener("message", onResponse);
        } else if (message.result !== undefined) {
          resolve(message.result);
          window.removeEventListener("message", onResponse);
        }
      }
    };
    window.addEventListener("message", onResponse);
    window.parent.postMessage(request, SPARKDOWN_EDITOR_ORIGIN);
  });
};

const preloadedImages = new Map<string, HTMLElement>();

const preloadImage = async (uri: string, src: string) => {
  if (uri && src) {
    if (preloadedImages.has(uri)) {
      return preloadedImages.get(uri);
    }
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => reject(img);
        preloadedImages.set(uri, img);
      });
    } catch (e) {
      console.warn("Could not preload: ", src);
    }
  }
  return null;
};

const unloadImage = async (uri: string) => {
  return preloadedImages.delete(uri);
};

class SparkdownGameWorkspace extends SparkdownWorkspace {
  override async sendNotification<P>(method: string, params: P): Promise<void> {
    const message = {
      jsonrpc: "2.0",
      method,
      params,
    };
    window.dispatchEvent(
      new CustomEvent(MessageProtocol.event, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: message,
      })
    );
    window.parent.postMessage(message);
  }

  override async getFileSrc(uri: string): Promise<string> {
    return sendRequest(ExecuteCommandMessage.type, {
      command: "sparkdown.getFileSrc",
      arguments: [uri],
    });
  }

  override async getFileText(uri: string): Promise<string> {
    return sendRequest(ExecuteCommandMessage.type, {
      command: "sparkdown.getFileText",
      arguments: [uri],
    });
  }

  override async deleteFile(uri: string) {
    const file = await super.deleteFile(uri);
    if (file?.type === "image") {
      unloadImage(file.uri);
    }
    return file;
  }

  override async createFile(uri: string) {
    const file = await super.createFile(uri);
    if (file?.type === "image" && file?.src) {
      preloadImage(file.uri, file.src);
    }
    return file;
  }

  override async changeFile(uri: string) {
    const file = await super.changeFile(uri);
    if (file?.type === "image" && file?.src) {
      unloadImage(file.uri);
      preloadImage(file.uri, file.src);
    }
    return file;
  }
}

const workspace = new SparkdownGameWorkspace("player");

window.addEventListener("message", async (e) => {
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
  // Handle Workspace Events
  if (InitializeMessage.type.isRequest(message)) {
    const params = message.params;
    const { program } = await workspace.initialize(
      params.initializationOptions
    );
    window.parent.postMessage(
      InitializeMessage.type.response(message.id, { capabilities: {}, program })
    );
  }
  if (DidChangeConfigurationMessage.type.isNotification(message)) {
    const { settings } = message.params;
    workspace.loadConfiguration(settings);
  }
  if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
    const { changes } = message.params;
    await Promise.all(
      changes
        .filter((change) => change.type == FileChangeType.Deleted)
        .map((change) => workspace.deleteFile(change.uri))
    );
    await Promise.all(
      changes
        .filter((change) => change.type == FileChangeType.Created)
        .map((change) => workspace.createFile(change.uri))
    );
    await Promise.all(
      changes
        .filter((change) => change.type == FileChangeType.Changed)
        .map((change) => workspace.changeFile(change.uri))
    );
  }
  if (DidChangeTextDocumentMessage.type.isNotification(message)) {
    await workspace.changeTextDocument(message.params);
  }
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
