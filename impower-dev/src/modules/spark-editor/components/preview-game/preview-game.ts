import { RevealEditorRangeMessage } from "@impower/spark-editor-protocol/src/protocols/editor/RevealEditorRangeMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import {
  getNextPreviewCommand,
  getPreviousPreviewCommand,
} from "../../../../../../packages/spark-engine/src";
import { SparkProgram } from "../../../../../../packages/sparkdown/src";
import SEElement from "../../core/se-element";
import { debounce } from "../../utils/debounce";
import { Workspace } from "../../workspace/Workspace";
import component from "./_preview-game";

export default class GamePreview extends SEElement {
  static override async define(
    tag = "se-preview-game",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  _uri = "";

  _programs: { uri: string; name: string; program: SparkProgram }[] = [];

  _entryProgram = "main";

  _entryLine = 0;

  protected override onConnected(): void {
    this.loadFile();
    window.addEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
    window.addEventListener(
      DidOpenFileEditorMessage.method,
      this.handleDidOpenFileEditor
    );
    window.addEventListener(
      SelectedEditorMessage.method,
      this.handleSelectedEditor
    );
    window.addEventListener("keydown", this.handleKeyDown);
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
    window.removeEventListener(
      DidOpenFileEditorMessage.method,
      this.handleDidOpenFileEditor
    );
    window.removeEventListener(
      SelectedEditorMessage.method,
      this.handleSelectedEditor
    );
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  handleDidChangeWatchedFiles = async (e: Event) => {
    if (e instanceof CustomEvent) {
      await this.loadFile();
    }
  };

  handleDidOpenFileEditor = async (e: Event) => {
    if (e instanceof CustomEvent) {
      this.debouncedLoadFile();
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
            await this.loadPreview();
          }
        }
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

  debouncedLoadFile = debounce(() => this.loadFile(), 500);

  async loadFile() {
    await this.loadGame();
    await this.loadPreview();
  }

  async loadGame() {
    const editor = await Workspace.window.getActiveEditor("logic");
    if (editor) {
      const { uri, selectedRange } = editor;
      this._programs = await Workspace.fs.getPrograms();
      this._entryProgram = Workspace.fs.getName(uri);
      this._entryLine = selectedRange?.start?.line ?? 0;
      this._uri = uri;
      this.emit(
        LoadGameMessage.method,
        LoadGameMessage.type.request({
          programs: Object.values(this._programs),
          options: {
            entryProgram: this._entryProgram,
            entryLine: this._entryLine,
          },
        })
      );
    }
  }

  async loadPreview() {
    const editor = await Workspace.window.getActiveEditor("logic");
    if (editor) {
      const { uri, version, text, visibleRange, selectedRange } = editor;
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

  async pageUp() {
    const editor = await Workspace.window.getActiveEditor("logic");
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
                  line: previewCommand.line,
                  character: 0,
                },
                end: {
                  line: previewCommand.line,
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
    const editor = await Workspace.window.getActiveEditor("logic");
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
                  line: previewCommand.line,
                  character: 0,
                },
                end: {
                  line: previewCommand.line,
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
