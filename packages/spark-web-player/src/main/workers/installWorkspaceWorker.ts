import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
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

export function installWorkspaceWorker(connection: MessageConnection) {
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
      return connection.sendRequest(ExecuteCommandMessage.type, {
        command: "sparkdown.getFileSrc",
        arguments: [uri],
      });
    }

    override async getFileText(uri: string): Promise<string> {
      return connection.sendRequest(ExecuteCommandMessage.type, {
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

  connection.addEventListener("message", async (e) => {
    const message = e.data;
    // Handle Workspace Events
    if (InitializeMessage.type.is(message)) {
      const { initializationOptions } = message.params;
      connection.sendResponse(message, async () => {
        const { program } = await state.workspace.initialize(
          initializationOptions
        );
        return {
          capabilities: {},
          program,
        };
      });
      return;
    }
    if (DidChangeConfigurationMessage.type.is(message)) {
      const { settings } = message.params;
      state.workspace.loadConfiguration(settings);
      return;
    }
    if (DidChangeWatchedFilesMessage.type.is(message)) {
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
      return;
    }
    if (DidChangeTextDocumentMessage.type.is(message)) {
      await state.workspace.changeTextDocument(message.params);
      return;
    }
    if (DidSelectTextDocumentMessage.type.is(message)) {
      await state.workspace.selectTextDocument(message.params);
      return;
    }
  });

  return state;
}
