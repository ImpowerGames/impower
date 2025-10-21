import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { ExecuteCommandMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
import { GameResizedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import { File } from "@impower/sparkdown/src/compiler";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";

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
    vscode.postMessage(request);
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
    vscode.postMessage(message);
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

  override onDeletedFile(file: File) {
    if (file?.type === "image") {
      unloadImage(file.uri);
    }
  }

  override onCreatedFile(file: File) {
    if (file?.type === "image" && file?.src) {
      preloadImage(file.uri, file.src);
    }
  }

  override onChangedFile(file: File) {
    if (file?.type === "image" && file?.src) {
      unloadImage(file.uri);
      preloadImage(file.uri, file.src);
    }
  }
}

const workspace = new SparkdownGameWorkspace("player");

window.addEventListener("message", async (e: MessageEvent) => {
  const message = e.data;
  if (InitializeMessage.type.isRequest(message)) {
    const params = message.params;
    const { program } = await workspace.initialize(
      params.initializationOptions
    );
    vscode.postMessage(
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
      // Forward responses and notifications from window to vscode extension
      vscode.postMessage(message);
      if (LoadPreviewMessage.type.isResponse(message)) {
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
  await Promise.allSettled([SparkWebPlayer.init()]);
};

load();
