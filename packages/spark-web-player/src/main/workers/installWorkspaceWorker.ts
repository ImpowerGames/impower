import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidCloseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidCloseTextDocumentMessage";
import { DidOpenTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { ExecuteCommandMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
import { File } from "@impower/sparkdown/src/compiler";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { getProgramImageSrcs } from "../utils/getProgramImageSrcs";
import { ImagePreloader } from "../utils/ImagePreloader";
import WORKSPACE_INLINE_WORKER_STRING from "./workspace.worker";

export function installWorkspaceWorker(connection: MessageConnection) {
  const imagePreloader = new ImagePreloader(() => new Image());
  // Keyed by document uri: `program.version` counts per uri, so a single
  // counter would let one script's version N suppress another script's
  // version N and leave that program's images unwarmed entirely.
  let lastWarmedVersions = new Map<string, number>();

  class SparkdownGameWorkspace extends SparkdownWorkspace {
    constructor(profilerId?: string) {
      super(WORKSPACE_INLINE_WORKER_STRING, profilerId);
    }

    override sendRequest<P, M extends string, R>(
      method: M,
      params: P,
    ): Promise<R> {
      const message = {
        jsonrpc: "2.0",
        method,
        params,
        id: crypto.randomUUID(),
      };
      return connection.request(message);
    }

    override async sendNotification<P>(
      method: string,
      params: P,
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
        }),
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

    override async getFileVersion(uri: string): Promise<number> {
      return connection.sendRequest(ExecuteCommandMessage.type, {
        command: "sparkdown.getFileVersion",
        arguments: [uri],
      });
    }

    override async getFileLanguageId(uri: string): Promise<string> {
      return connection.sendRequest(ExecuteCommandMessage.type, {
        command: "sparkdown.getFileLanguageId",
        arguments: [uri],
      });
    }

    override async onDeletedFile(file: File) {
      if (file?.type === "image" && file?.src) {
        imagePreloader.evict(file.src);
        // Force the next compile to re-sweep even if the program itself is
        // byte-identical, or the urls just evicted would stay cold.
        lastWarmedVersions = new Map();
      }
      return file;
    }

    override async onChangedFile(file: File) {
      if (file?.type === "image" && file?.src) {
        // Editing an asset re-stamps its `?v=` signature, so the warmed URLs
        // are dead. The compile that follows warms the new ones.
        imagePreloader.evict(file.src);
        // Force the next compile to re-sweep even if the program itself is
        // byte-identical, or the urls just evicted would stay cold.
        lastWarmedVersions = new Map();
      }
      return file;
    }

    // Warming is driven by the COMPILED PROGRAM, not by file enumeration.
    // Enumeration only knows each asset's root url, and an svg is displayed
    // through `<root>?v=<sig>&filters=<canonical>` — so a per-file warm-up
    // fetches a url the renderer never asks for and leaves the one it does ask
    // for cold, which is the pop-in in #344. The program carries the filters.
    override onCompiledTextDocument(params: {
      textDocument: { uri: string };
      program: SparkProgram;
    }) {
      try {
        // This hook fires on EVERY compile, i.e. every debounced keystroke, and
        // the program arrives structured-cloned from the compiler worker — so
        // `filterImage`'s memoization does not carry across compiles and the
        // whole resolution would re-run per keystroke. `version` only moves
        // when the program actually changed, so gate on it.
        const uri = params.textDocument?.uri ?? "";
        const version = params.program?.version;
        if (version !== undefined && version === lastWarmedVersions.get(uri)) {
          return;
        }
        if (version !== undefined) {
          lastWarmedVersions.set(uri, version);
        }
        imagePreloader.warmOnly(getProgramImageSrcs(params.program?.context));
      } catch (e) {
        // `SparkdownWorkspace.compile` calls this hook without a catch, so a
        // throw here would fail the COMPILE. A warm-up is an optimization; it
        // must never be able to take the program down with it.
        console.warn("Could not warm program images:", e);
      }
    }
  }

  const state = { workspace: new SparkdownGameWorkspace("player") };

  connection.addEventListener("message", async (e) => {
    const message = e.data;
    // Handle Workspace Events
    if (InitializeMessage.type.is(message)) {
      connection.sendResponse(message, async () => {
        // The initial compile inside initialize() already delivers the
        // program to the game via the CompiledProgram notification; no caller
        // reads it from this response, so don't clone the multi-MB program
        // into it too.
        await state.workspace.initialize(message.params);
        return {
          capabilities: {},
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
          .map((change) => state.workspace.deleteFile(change.uri)),
      );
      await Promise.all(
        changes
          .filter((change) => change.type == FileChangeType.Created)
          .map((change) => state.workspace.createFile(change.uri)),
      );
      await Promise.all(
        changes
          .filter((change) => change.type == FileChangeType.Changed)
          .map((change) => state.workspace.changeFile(change.uri)),
      );
      return;
    }
    if (DidOpenTextDocumentMessage.type.is(message)) {
      state.workspace.openTextDocument(message.params);
      return;
    }
    if (DidCloseTextDocumentMessage.type.is(message)) {
      state.workspace.closeTextDocument(message.params);
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
