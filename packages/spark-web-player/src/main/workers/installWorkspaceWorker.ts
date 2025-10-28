import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { ExecuteCommandMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
import { File } from "@impower/sparkdown/src/compiler";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import WORKSPACE_INLINE_WORKER_STRING from "./workspace.worker";

export function installWorkspaceWorker(
  postMessage: (message: any, transfer?: Transferable[] | undefined) => void
) {
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
      postMessage(request);
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
    constructor(profilerId?: string) {
      super(WORKSPACE_INLINE_WORKER_STRING, profilerId);
    }

    override async sendNotification<P>(
      method: string,
      params: P
    ): Promise<void> {
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

    override async onDeletedFile(file: File) {
      if (file?.type === "image") {
        unloadImage(file.uri);
      }
      return file;
    }

    override async onCreatedFile(file: File) {
      if (file?.type === "image" && file?.src) {
        preloadImage(file.uri, file.src);
      }
      return file;
    }

    override async onChangedFile(file: File) {
      if (file?.type === "image" && file?.src) {
        unloadImage(file.uri);
        preloadImage(file.uri, file.src);
      }
      return file;
    }
  }

  const state = { workspace: new SparkdownGameWorkspace("player") };

  window.addEventListener("message", async (e) => {
    const message = e.data;
    // Handle Workspace Events
    if (InitializeMessage.type.isRequest(message)) {
      const params = message.params;
      const { program } = await state.workspace.initialize(
        params.initializationOptions
      );
      postMessage(
        InitializeMessage.type.response(message.id, {
          capabilities: {},
          program,
        })
      );
    } else if (DidChangeConfigurationMessage.type.isNotification(message)) {
      const { settings } = message.params;
      state.workspace.loadConfiguration(settings);
    } else if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
      const { changes } = message.params;
      await Promise.all(
        changes
          .filter((change) => change.type == FileChangeType.Deleted)
          .map((change) => state.workspace.deleteFile(change.uri))
      );
      await Promise.all(
        changes
          .filter((change) => change.type == FileChangeType.Created)
          .map((change) => state.workspace.createFile(change.uri))
      );
      await Promise.all(
        changes
          .filter((change) => change.type == FileChangeType.Changed)
          .map((change) => state.workspace.changeFile(change.uri))
      );
    } else if (DidChangeTextDocumentMessage.type.isNotification(message)) {
      await state.workspace.changeTextDocument(message.params);
    } else if (DidSelectTextDocumentMessage.type.isNotification(message)) {
      await state.workspace.selectTextDocument(message.params);
    }
  });

  return state;
}
