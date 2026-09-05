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
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { getSharedAssetCache } from "../assets/sharedAssetCache";
import {
  applyPreviewHint,
  planPreviewHint,
  type PreviewHintState,
} from "../utils/previewHint";
import WORKSPACE_INLINE_WORKER_STRING from "./workspace.worker";

const ASSET_FILE_TYPES = new Set(["image", "audio", "font", "video"]);

/** `program.pathLocations` as the entries `findClosestPath` walks, computed
 *  once per program object rather than per cursor move. */
const pathEntriesOf = new WeakMap<
  SparkProgram,
  Array<[string, [number, number, number, number, number]]>
>();

export function installWorkspaceWorker(connection: MessageConnection) {
  const cache = getSharedAssetCache();
  // The beat the cursor last landed on, so a cursor that only moves within
  // a beat (the editor re-selects on every column change) asks for nothing.
  let lastHint: PreviewHintState | undefined;

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
    // simulation runs and are resident by the time the checkpoint lands: the
    // cursor's own beats first, in the express lane, because the engine's
    // gate will ask for exactly those once the route is planned; then the
    // beats around the cursor, then the rest of the scene. The engine asks
    // for the same window again at connect; the cache answers from what is
    // already in flight.
    override onSelectTextDocument(params: {
      textDocument: { uri: string };
      selectedRange: { start: { line: number } };
    }) {
      try {
        const uri = params.textDocument?.uri ?? "";
        const program = this.program(uri);
        const sceneAssets = program?.sceneAssets;
        if (!program || !sceneAssets) {
          return;
        }
        const line = params.selectedRange.start.line;
        let entries = pathEntriesOf.get(program);
        if (!entries) {
          entries = Object.entries(program.pathLocations ?? {});
          pathEntriesOf.set(program, entries);
        }
        const plan = planPreviewHint(program, uri, line, entries, lastHint);
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
