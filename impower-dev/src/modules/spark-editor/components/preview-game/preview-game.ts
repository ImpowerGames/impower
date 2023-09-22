import { RevealEditorRangeMessage } from "@impower/spark-editor-protocol/src/protocols/editor/RevealEditorRangeMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { DidExecuteGameCommandMessage } from "@impower/spark-editor-protocol/src/protocols/game/DidExecuteGameCommandMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { DidOpenTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import {
  getNextPreviewCommand,
  getPreviousPreviewCommand,
} from "../../../../../../packages/spark-engine/src";
import { SparkProgram } from "../../../../../../packages/sparkdown/src";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-game";

export default class GamePreview extends Component(spec) {
  _uri = "";

  _programs: { uri: string; name: string; program: SparkProgram }[] = [];

  _entryLine = 0;

  override onConnected() {
    this.configureGame();
    this.loadGame();
    this.loadPreview();
    window.addEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
    window.addEventListener(
      DidOpenTextDocumentMessage.method,
      this.handleDidOpenTextDocument
    );
    window.addEventListener(
      SelectedEditorMessage.method,
      this.handleSelectedEditor
    );
    window.addEventListener(
      DidExecuteGameCommandMessage.method,
      this.handleDidExecuteGameCommand
    );
    window.addEventListener("keydown", this.handleKeyDown);
  }

  override onDisconnected() {
    window.removeEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
    window.removeEventListener(
      DidOpenTextDocumentMessage.method,
      this.handleDidOpenTextDocument
    );
    window.removeEventListener(
      SelectedEditorMessage.method,
      this.handleSelectedEditor
    );
    window.removeEventListener(
      DidExecuteGameCommandMessage.method,
      this.handleDidExecuteGameCommand
    );
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  handleDidChangeWatchedFiles = async (e: Event) => {
    if (e instanceof CustomEvent) {
      await this.configureGame();
      await this.loadGame();
      await this.loadPreview();
    }
  };

  handleDidOpenTextDocument = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidOpenTextDocumentMessage.type.isNotification(message)) {
        await this.configureGame();
        await this.loadGame();
        await this.loadPreview();
      }
    }
  };

  handleSelectedEditor = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (SelectedEditorMessage.type.isNotification(message)) {
        const { textDocument, selectedRange, docChanged } = message.params;
        if (textDocument.uri === this._uri && !docChanged) {
          const newEntryLine = selectedRange?.start?.line ?? 0;
          if (newEntryLine !== this._entryLine) {
            await this.configureGame();
            await this.loadPreview();
          }
        }
      }
    }
  };

  handleDidExecuteGameCommand = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidExecuteGameCommandMessage.type.isNotification(message)) {
        const { textDocument, range } = message.params;
        this.emit(
          RevealEditorRangeMessage.method,
          RevealEditorRangeMessage.type.request({
            textDocument,
            selectedRange: range,
          })
        );
      }
    }
  };

  handleKeyDown = async (e: KeyboardEvent) => {
    if (e.key === "PageUp") {
      await this.pageUp();
    }
    if (e.key === "PageDown") {
      await this.pageDown();
    }
  };

  async configureGame() {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      const editor = await Workspace.window.getOpenEditor("logic");
      if (editor) {
        const { uri, selectedRange } = editor;
        if (uri) {
          this._programs = await Workspace.fs.getPrograms(projectId);
          this._entryLine = selectedRange?.start?.line ?? 0;
          this._uri = uri;
          if (this._programs.some((p) => p.uri === uri)) {
            this.emit(
              ConfigureGameMessage.method,
              ConfigureGameMessage.type.request({
                settings: {
                  entryProgram: uri,
                  entryLine: this._entryLine,
                },
              })
            );
          }
        }
      }
    }
  }

  async loadGame() {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      const editor = await Workspace.window.getOpenEditor("logic");
      if (editor) {
        const { uri, selectedRange } = editor;
        if (uri) {
          this._programs = await Workspace.fs.getPrograms(projectId);
          this._entryLine = selectedRange?.start?.line ?? 0;
          this._uri = uri;
          if (this._programs.some((p) => p.uri === uri)) {
            this.emit(
              LoadGameMessage.method,
              LoadGameMessage.type.request({
                programs: this._programs,
              })
            );
          }
        }
      }
    }
  }

  async loadPreview() {
    const store = this.stores.workspace.current;
    const running = store.preview.modes.game.running;
    if (!running) {
      const editor = await Workspace.window.getOpenEditor("logic");
      if (editor) {
        const { uri, version, text, visibleRange, selectedRange } = editor;
        if (this._programs.some((p) => p.uri === uri)) {
          this.emit(
            LoadPreviewMessage.method,
            LoadPreviewMessage.type.request({
              type: "game",
              textDocument: {
                uri,
                languageId: "sparkdown",
                version,
                text: text!,
              },
              visibleRange,
              selectedRange,
            })
          );
        }
      }
    }
  }

  async pageUp() {
    const editor = await Workspace.window.getOpenEditor("logic");
    if (editor) {
      const { uri, selectedRange } = editor;
      const cached = this._programs.find((p) => p.uri === uri);
      const program = cached?.program;
      const currLine = selectedRange?.start.line ?? 0;
      if (program) {
        const previewCommand = getPreviousPreviewCommand(program, currLine);
        if (previewCommand) {
          this.emit(
            RevealEditorRangeMessage.method,
            RevealEditorRangeMessage.type.request({
              textDocument: { uri },
              selectedRange: {
                start: {
                  line: previewCommand.source.line,
                  character: 0,
                },
                end: {
                  line: previewCommand.source.line,
                  character: 0,
                },
              },
            })
          );
        }
      }
    }
  }

  async pageDown() {
    const editor = await Workspace.window.getOpenEditor("logic");
    if (editor) {
      const { uri, selectedRange } = editor;
      const cached = this._programs.find((p) => p.uri === uri);
      const program = cached?.program;
      const currLine = selectedRange?.start.line ?? 0;
      if (program) {
        const previewCommand = getNextPreviewCommand(program, currLine);
        if (previewCommand) {
          this.emit(
            RevealEditorRangeMessage.method,
            RevealEditorRangeMessage.type.request({
              textDocument: { uri },
              selectedRange: {
                start: {
                  line: previewCommand.source.line,
                  character: 0,
                },
                end: {
                  line: previewCommand.source.line,
                  character: 0,
                },
              },
            })
          );
        }
      }
    }
  }
}
