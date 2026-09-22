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
import type { File } from "@impower/sparkdown/src/compiler";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { getSharedAssetCache } from "../assets/sharedAssetCache";
import {
  applyPreviewHint,
  planPreviewHint,
  type PreviewHintState,
} from "../utils/previewHint";
import { ConfigurePlayerWorkerMessage } from "./messages/ConfigurePlayerWorkerMessage";
import { PreviewHintMessage } from "./messages/PreviewHintMessage";
import {
  ProgramForPlayMessage,
  type ProgramForPlayResult,
} from "./messages/ProgramForPlayMessage";
import type { WorkerDisplayWorkspace } from "./WorkerDisplayWorkspace";
import { WorkerGameLink } from "./WorkerGameLink";
import WORKSPACE_INLINE_WORKER_STRING from "./workspace.worker";

const ASSET_FILE_TYPES = new Set(["image", "audio", "font", "video"]);

export function installWorkspaceWorker(connection: MessageConnection) {
  const cache = getSharedAssetCache();
  // The beat the cursor last landed on, so a cursor that only moves within
  // a beat (the editor re-selects on every column change) asks for nothing.
  let lastHint: PreviewHintState | undefined;

  class SparkdownGameWorkspace
    extends SparkdownWorkspace
    implements WorkerDisplayWorkspace
  {
    /** The stopped preview is displayed from the worker's game
     *  (`installPlayerWorker`). Set by the `workerDisplaysPreview` field of
     *  the initialization options, which an author never sets. */
    workerDisplaysPreview = false;

    readonly gameLink: WorkerGameLink;

    constructor(profilerId?: string) {
      super(WORKSPACE_INLINE_WORKER_STRING, profilerId);
      this.gameLink = new WorkerGameLink(this._compilerChannelConnection);
      this._compilerChannelConnection.addEventListener("message", (e) => {
        const message = e.data;
        if (PreviewHintMessage.type.isNotification(message)) {
          try {
            applyPreviewHint(cache, message.params);
          } catch (e) {
            // A hint is an optimization; it must never take anything down.
            console.warn("Could not prefetch the selected scene's images:", e);
          }
        }
      });
    }

    override initialize(
      params: Parameters<SparkdownWorkspace["initialize"]>[0],
    ) {
      const options = params.initializationOptions as
        | (NonNullable<typeof params.initializationOptions> & {
            workerDisplaysPreview?: boolean;
          })
        | undefined;
      if (options) {
        const { workerDisplaysPreview, ...compilerOptions } = options;
        this.workerDisplaysPreview = workerDisplaysPreview === true;
        params = { ...params, initializationOptions: compilerOptions };
      }
      // Ahead of everything the initialization sends the compiler, which
      // handles its messages in order.
      this._compilerChannelConnection
        .sendRequest(ConfigurePlayerWorkerMessage.type, {
          workerDisplaysPreview: this.workerDisplaysPreview,
        })
        .catch(console.error);
      return super.initialize(params);
    }

    async programForPlay(
      program: string,
      startFrom: { file: string; line: number } | undefined,
    ): Promise<ProgramForPlayResult> {
      await this.compilerReady();
      const result = await this._compilerChannelConnection.sendRequest(
        ProgramForPlayMessage.type,
        { program, startFrom },
      );
      if (result.program) {
        this._programTransport.decode(result.program);
      }
      return result;
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
      if (ASSET_FILE_TYPES.has(file?.type) && file?.src) {
        cache.evictFile(file.src);
        lastHint = undefined;
      }
      return file;
    }

    override async onChangedFile(file: File) {
      if (ASSET_FILE_TYPES.has(file?.type) && file?.src) {
        // Editing an asset re-stamps its `?v=` signature, so every resident
        // url of the file is dead. Whatever needs the new bytes asks again.
        cache.evictFile(file.src);
        lastHint = undefined;
      }
      return file;
    }

    // The cursor landed on a beat. This runs on the page BEFORE the worker
    // starts planning the route to the line, which can take hundreds of
    // milliseconds on a long scene, so the images are fetching while the
    // simulation runs and are resident by the time the checkpoint lands: a
    // guess at the cursor's own beat first, in the express lane, because the
    // engine's gate asks for what that beat shows once the route is planned
    // and the beat has run (a guess, since nothing can run yet: the beat at
    // or before the cursor and the one after it); then the beats around the
    // cursor, then the rest of the scene. The engine asks for the same
    // window again at connect; the cache answers from what is already in
    // flight.
    override onSelectTextDocument(params: {
      textDocument: { uri: string };
      selectedRange: { start: { line: number } };
    }) {
      if (this.workerDisplaysPreview) {
        // The worker holds the program and sends the warm-up itself
        // (`PreviewHintMessage`).
        return;
      }
      try {
        const uri = params.textDocument?.uri ?? "";
        const program = this.program(uri);
        const sceneAssets = program?.sceneAssets;
        if (!program || !sceneAssets) {
          return;
        }
        const line = params.selectedRange.start.line;
        const plan = planPreviewHint(program, uri, line, lastHint);
        if (!plan) {
          return;
        }
        lastHint = plan.state;
        // Visuals only, as a preview shows; fonts are gated by the layouts
        // as they mount. A superset of what the engine will ask for is fine.
        applyPreviewHint(cache, plan);
      } catch (e) {
        // A hint is an optimization; it must never take the selection down.
        console.warn("Could not prefetch the selected scene's images:", e);
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
