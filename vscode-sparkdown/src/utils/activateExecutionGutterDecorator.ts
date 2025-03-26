import { GameExecutedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExecutedMessage";
import { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { debounce } from "./debounce";
import { getEditor } from "./getEditor";

const previouslyExecutedLineDecoration: vscode.TextEditorDecorationType =
  vscode.window.createTextEditorDecorationType({
    dark: {
      overviewRulerColor: new vscode.ThemeColor("editorGhostText.foreground"),
      borderColor: "#ffffff4D",
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor("editorGhostText.foreground"),
      borderColor: "#0000004D",
    },
    borderWidth: "0 0 0 2px",
    borderStyle: "solid",
    isWholeLine: true,
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

const currentlyExecutedLineDecoration: vscode.TextEditorDecorationType =
  vscode.window.createTextEditorDecorationType({
    dark: {
      overviewRulerColor: new vscode.ThemeColor(
        "editor.stackFrameHighlightBackground"
      ),
      borderColor: "#ffcc00",
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editor.stackFrameHighlightBackground"
      ),
      borderColor: "#ffcc00",
    },
    borderWidth: "0 0 0 2px",
    borderStyle: "solid",
    isWholeLine: true,
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

const previewingLineDecoration: vscode.TextEditorDecorationType =
  vscode.window.createTextEditorDecorationType({
    dark: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      borderColor: "#1177bb",
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      borderColor: "#1177bb",
    },
    borderWidth: "0 0 0 2px",
    borderStyle: "solid",
    isWholeLine: true,
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

let previouslyExecutedLines = new Set<number>();
let currentlyExecutedLines = new Set<number>();
let previewingLines = new Set<number>();

export const activateExecutionGutterDecorator = (
  context: vscode.ExtensionContext
) => {
  const handleGameExecuted = (message: Message) => {
    if (GameExecutedMessage.type.isNotification(message)) {
      const { locations, state } = message.params;
      if (state === "running") {
        const documentLocations = Object.groupBy(locations, ({ uri }) => uri);
        for (const [uri, locations] of Object.entries(documentLocations)) {
          const editor = getEditor(uri);
          if (editor) {
            for (const line of currentlyExecutedLines) {
              previouslyExecutedLines.add(line);
            }
            currentlyExecutedLines.clear();
            if (locations) {
              for (const location of locations) {
                for (
                  let i = location.range.start.line;
                  i <= location.range.end.line;
                  i++
                ) {
                  currentlyExecutedLines.add(i);
                }
              }
            }
            debouncedUpdateDecorations(editor);
          }
        }
      } else {
        const documentLocations = Object.groupBy(locations, ({ uri }) => uri);
        for (const [uri, locations] of Object.entries(documentLocations)) {
          const editor = getEditor(uri);
          if (editor) {
            previewingLines.clear();
            if (locations) {
              for (const location of locations) {
                for (
                  let i = location.range.start.line;
                  i <= location.range.end.line;
                  i++
                ) {
                  previewingLines.add(i);
                }
              }
            }
            debouncedUpdateDecorations(editor);
          }
        }
      }
    }
  };
  SparkdownPreviewGamePanelManager.instance.connection.incoming.addListener(
    GameExecutedMessage.method,
    handleGameExecuted
  );
  context.subscriptions.push({
    dispose: () => {
      SparkdownPreviewGamePanelManager.instance.connection.incoming.removeListener(
        GameExecutedMessage.method,
        handleGameExecuted
      );
    },
  });

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(() => {
      previewingLines.clear();
      updateLineDecorationsOfAllEditors();
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession(() => {
      previouslyExecutedLines.clear();
      currentlyExecutedLines.clear();
      updateLineDecorationsOfAllEditors();
    })
  );

  context.subscriptions.push({
    dispose: () => {
      previouslyExecutedLines.clear();
      currentlyExecutedLines.clear();
      previewingLines.clear();
      updateLineDecorationsOfAllEditors();
      if (previouslyExecutedLineDecoration) {
        previouslyExecutedLineDecoration.dispose();
      }
      if (currentlyExecutedLineDecoration) {
        currentlyExecutedLineDecoration.dispose();
      }
      if (previewingLineDecoration) {
        previewingLineDecoration.dispose();
      }
    },
  });
};

const debouncedUpdateDecorations = debounce((editor: vscode.TextEditor) => {
  updateDecorations(editor);
}, 100);

const updateDecorations = (editor: vscode.TextEditor) => {
  // Apply decorations
  editor.setDecorations(
    previouslyExecutedLineDecoration,
    Array.from(previewingLines).map(
      (line) => new vscode.Range(line, 0, line, 0)
    )
  );
  editor.setDecorations(
    currentlyExecutedLineDecoration,
    Array.from(currentlyExecutedLines).map(
      (line) => new vscode.Range(line, 0, line, 0)
    )
  );
  editor.setDecorations(
    previewingLineDecoration,
    Array.from(previewingLines).map(
      (line) => new vscode.Range(line, 0, line, 0)
    )
  );
};

const updateLineDecorationsOfAllEditors = () => {
  for (const editor of vscode.window.visibleTextEditors) {
    updateDecorations(editor);
  }
};
