import {
  SelectedEditorMessage,
  SelectedEditorMethod,
  SelectedEditorParams,
} from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import {
  GameExecutedMessage,
  GameExecutedMethod,
  GameExecutedParams,
} from "@impower/spark-editor-protocol/src/protocols/game/GameExecutedMessage";
import {
  GameStartedMessage,
  GameStartedMethod,
  GameStartedParams,
} from "@impower/spark-editor-protocol/src/protocols/game/GameStartedMessage";
import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { SparkProgram } from "../../../../../../packages/sparkdown/src/types/SparkProgram";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-game";

export default class GamePreview extends Component(spec) {
  _program?: SparkProgram;

  _startFromFile = "";

  _startFromLine = 0;

  override onConnected() {
    this.configureGame();
    this.loadPreview();
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    window.addEventListener("keydown", this.handleKeyDown);
    this.loadGame();
  }

  override onDisconnected() {
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  protected handleProtocol = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (SelectedEditorMessage.type.is(e.detail)) {
        this.handleSelectedEditor(e.detail);
      }
      if (GameStartedMessage.type.is(e.detail)) {
        this.handleGameStarted(e.detail);
      }
      if (GameExecutedMessage.type.is(e.detail)) {
        this.handleGameExecuted(e.detail);
      }
    }
  };

  handleDidCompileTextDocument = async (e: Event) => {
    if (e instanceof CustomEvent) {
      await this.configureGame();
      await this.loadGame();
      await this.loadPreview();
    }
  };

  handleSelectedEditor = async (
    message: NotificationMessage<SelectedEditorMethod, SelectedEditorParams>
  ) => {
    const { textDocument, selectedRange, docChanged } = message.params;
    if (textDocument.uri === this._startFromFile && !docChanged) {
      const newEntryLine = selectedRange?.start?.line ?? 0;
      if (newEntryLine !== this._startFromLine) {
        await this.configureGame();
        await this.loadPreview();
      }
    }
  };

  handleGameStarted = async (
    message: NotificationMessage<GameStartedMethod, GameStartedParams>
  ) => {
    Workspace.window.startGame();
  };

  handleGameExecuted = async (
    message: NotificationMessage<GameExecutedMethod, GameExecutedParams>
  ) => {
    const { locations } = message.params;
    const location = locations[0];
    if (location) {
      Workspace.window.showDocument(location.uri, location.range, true);
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

  override onStoreUpdate() {
    const store = this.stores.workspace.current;
    const running = store?.preview?.modes?.game?.running;
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (!running && editor) {
      const { uri } = editor;
      if (uri && uri !== this._startFromFile) {
        this.configureGame();
      }
    }
  }

  async configureGame() {
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (editor) {
      const { uri, selectedRange } = editor;
      const startLine = selectedRange?.start?.line ?? 0;
      this._program = await Workspace.ls.getProgram();
      this._startFromFile = uri;
      this._startFromLine = startLine;
      const breakpoints: { file: string; line: number }[] = [];
      if (Workspace.window.store.debug?.breakpoints) {
        Object.entries(Workspace.window.store.debug.breakpoints).forEach(
          ([uri, ranges]) => {
            ranges.forEach((range) =>
              breakpoints.push({ file: uri, line: range.start.line })
            );
          }
        );
      }
      const startpoint = {
        file: uri,
        line: startLine,
      };
      this.emit(
        MessageProtocol.event,
        ConfigureGameMessage.type.request({
          breakpoints,
          startpoint,
        })
      );
    }
  }

  async loadGame() {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      const editor = Workspace.window.getActiveEditorForPane("logic");
      if (editor) {
        const { uri, selectedRange } = editor;
        if (uri) {
          this._program = await Workspace.ls.getProgram();
          this._startFromFile = uri;
          this._startFromLine = selectedRange?.start?.line ?? 0;
          this.emit(
            MessageProtocol.event,
            LoadGameMessage.type.request({
              program: this._program,
            })
          );
        }
      }
    }
  }

  async loadPreview() {
    const store = this.stores.workspace.current;
    const projectId = store.project.id;
    const running = store.preview.modes.game.running;
    if (projectId && !running) {
      const editor = Workspace.window.getActiveEditorForPane("logic");
      if (editor) {
        const { uri, visibleRange, selectedRange } = editor;
        const files = await Workspace.fs.getFiles(projectId);
        const file = files[uri];
        if (file && file.text != null) {
          this.emit(
            MessageProtocol.event,
            LoadPreviewMessage.type.request({
              type: "game",
              textDocument: {
                uri,
                languageId: "sparkdown",
                version: file.version,
                text: file.text,
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
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (editor) {
      const { uri, selectedRange } = editor;
      const program = this._program;
      const currLine = selectedRange?.start.line ?? 0;
      if (program) {
        const prevSource = this.getPreviousSource(program, uri, currLine);
        if (prevSource && prevSource.file === uri) {
          const range = {
            start: {
              line: prevSource.line,
              character: 0,
            },
            end: {
              line: prevSource.line,
              character: 0,
            },
          };
          Workspace.window.showDocument(uri, range, true);
        }
      }
    }
  }

  async pageDown() {
    const editor = Workspace.window.getActiveEditorForPane("logic");
    if (editor) {
      const { uri, selectedRange } = editor;
      const program = this._program;
      const currLine = selectedRange?.start.line ?? 0;
      if (program) {
        const nextSource = this.getNextSource(program, uri, currLine);
        if (nextSource && nextSource.file === uri) {
          const range = {
            start: {
              line: nextSource.line,
              character: 0,
            },
            end: {
              line: nextSource.line,
              character: 0,
            },
          };
          Workspace.window.showDocument(uri, range, true);
        }
      }
    }
  }

  getPreviousSource(
    program: SparkProgram,
    currentFile: string | undefined,
    currentLine: number
  ) {
    return this.getOffsetSource(program, currentFile, currentLine, -1);
  }

  getNextSource(
    program: SparkProgram,
    currentFile: string | undefined,
    currentLine: number
  ) {
    return this.getOffsetSource(program, currentFile, currentLine, 1);
  }

  getOffsetSource(
    program: SparkProgram,
    currentFile: string | undefined,
    currentLine: number,
    offset: number
  ) {
    if (program) {
      const files = Object.keys(program.scripts);
      const pathToLocationEntries = Object.entries(
        program.pathToLocation || {}
      );
      const index = this.getClosestSourceIndex(
        files,
        pathToLocationEntries,
        currentFile,
        currentLine
      );
      if (index == null) {
        return null;
      }
      const uuidToSourceEntry = pathToLocationEntries[index + offset];
      if (uuidToSourceEntry == null) {
        return null;
      }
      const [uuid, source] = uuidToSourceEntry;
      if (uuid == null) {
        return null;
      }
      const [fileIndex, lineIndex] = source;
      const file = files[fileIndex];
      const line = lineIndex;
      return { file, line };
    }
    return undefined;
  }

  getClosestSourceIndex(
    allFiles: string[],
    allPathToLocationEntries: [
      string,
      [number, number, number, number, number]
    ][],
    currentFile: string | undefined,
    currentLine: number
  ) {
    if (currentFile == null) {
      return null;
    }
    const fileIndex = allFiles.indexOf(currentFile);
    if (fileIndex < 0) {
      return null;
    }
    let closestIndex: number | null = null;
    for (let i = 0; i < allPathToLocationEntries.length; i++) {
      const entry = allPathToLocationEntries[i]!;
      const [, source] = entry;
      if (source) {
        const [currFileIndex, currStartLine] = source;
        if (currFileIndex === fileIndex && currStartLine === currentLine) {
          closestIndex = i;
          break;
        }
        if (currFileIndex === fileIndex && currStartLine > currentLine) {
          closestIndex = i - 1;
          break;
        }
        if (currFileIndex > fileIndex) {
          closestIndex = null;
          break;
        }
      }
    }
    return closestIndex;
  }
}
