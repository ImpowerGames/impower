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
import type { File, Range } from "@impower/sparkdown/src/compiler";
import type { SelectCompilerDocumentResult } from "@impower/sparkdown/src/compiler/classes/messages/SelectCompilerDocumentMessage";
import { SelectedCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectedCompilerDocumentMessage";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { getSharedAssetCache } from "../assets/sharedAssetCache";
import { applyPreviewHint } from "../utils/previewHint";
import type { WorkerBusyParams } from "./messages/WorkerBusyMessage";
import { PreviewHintMessage } from "./messages/PreviewHintMessage";
import { ProgramHeldMessage } from "./messages/ProgramHeldMessage";
import type {
  PreviewPoint,
  WorkerDisplayWorkspace,
  WorkerHang,
} from "./WorkerDisplayWorkspace";
import { respondToWorkerHang } from "./respondToWorkerHang";
import { SetAsidePoints } from "./SetAsidePoints";
import { WorkerGameLink } from "./WorkerGameLink";
import { WorkerWatchdog } from "./WorkerWatchdog";
import WORKSPACE_INLINE_WORKER_STRING from "./workspace.worker";

const ASSET_FILE_TYPES = new Set(["image", "audio", "font", "video"]);

export function installWorkspaceWorker(connection: MessageConnection) {
  const cache = getSharedAssetCache();

  class SparkdownGameWorkspace
    extends SparkdownWorkspace
    implements WorkerDisplayWorkspace
  {
    readonly gameLink: WorkerGameLink;

    // The worker can be restarted in place (#679), so the text of each open
    // document is kept here too.
    protected override _mirrorDocumentTexts = true;

    protected _watchdog!: WorkerWatchdog;

    protected _hangListeners = new Set<(hang: WorkerHang) => void>();

    /** Counts edits to open documents, which with the files revision says
     *  whether the project has changed since a point was set aside. */
    protected _documentsRevision = 0;

    protected _setAside = new SetAsidePoints(
      () => `${this._documentsRevision} ${this.filesRevision}`,
    );

    constructor(profilerId?: string) {
      super(WORKSPACE_INLINE_WORKER_STRING, profilerId);
      this.gameLink = new WorkerGameLink(this._compilerChannelConnection);
      this.listenToCompiler(this._compilerChannelConnection);
    }

    protected listenToCompiler(compiler: MessageConnection) {
      compiler.addEventListener("message", (e) => {
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
      this._watchdog = new WorkerWatchdog(compiler, this.onWorkerHang);
    }

    protected override onCompilerRestarted(compiler: MessageConnection) {
      this.gameLink.reconnect(compiler);
      this.listenToCompiler(compiler);
    }

    /** The worker has run a story without yielding for longer than the page
     *  waits. Whatever it was asked since is unanswered and will stay so: it
     *  is terminated and another started in its place, which is given the
     *  project as the editor holds it and routes to the author's selection,
     *  unless that is set aside (`respondToWorkerHang` decides what is, and
     *  tells the listeners first). */
    protected onWorkerHang = (busy: WorkerBusyParams) => {
      this._watchdog.dispose();
      respondToWorkerHang(busy, {
        setAside: this._setAside,
        selected: this._documentSelected,
        listeners: this._hangListeners,
      });
      console.warn(
        `The player's worker ran a script for ${busy.busyMs} ms without yielding, so it was restarted`,
        JSON.stringify({
          running: busy.location
            ? `${busy.location.uri}:${busy.location.range.start.line}`
            : null,
          routingTo: busy.routingTo
            ? `${busy.routingTo.file}:${busy.routingTo.line}`
            : null,
        }),
      );
      this.restartCompiler().catch((e) => console.error(e));
    };

    addWorkerHangListener(listener: (hang: WorkerHang) => void) {
      this._hangListeners.add(listener);
      return () => {
        this._hangListeners.delete(listener);
      };
    }

    isSetAside(point: PreviewPoint) {
      return this._setAside.has(point);
    }

    override onChangeTextDocument() {
      this._documentsRevision += 1;
    }

    protected override compileStartFrom() {
      const selected = super.compileStartFrom();
      return selected && !this.isSetAside(selected) ? selected : undefined;
    }

    override async selectTextDocument(params: {
      textDocument: { uri: string };
      selectedRange: Range;
      docChanged: boolean;
      userEvent?: boolean;
    }) {
      const point = {
        file: params.textDocument.uri,
        line: params.selectedRange.start.line,
      };
      if (!this.isSetAside(point)) {
        return super.selectTextDocument(params);
      }
      // The worker routes to a selection as it arrives, and a route to this
      // point is what stopped it answering: the selection is the author's,
      // but the worker is not asked to route to it until the project changes.
      this._documentSelected = point;
      const result: SelectCompilerDocumentResult = { ...params };
      this.sendNotification(SelectedCompilerDocumentMessage.method, result);
      return result;
    }

    async programHeld(program: string): Promise<void> {
      await this._compilerChannelConnection.sendRequest(
        ProgramHeldMessage.type,
        { program },
      );
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
      }
      return file;
    }

    override async onChangedFile(file: File) {
      if (ASSET_FILE_TYPES.has(file?.type) && file?.src) {
        // Editing an asset re-stamps its `?v=` signature, so every resident
        // url of the file is dead. Whatever needs the new bytes asks again.
        cache.evictFile(file.src);
      }
      return file;
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
