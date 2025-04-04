import { GameExecutedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExecutedMessage";
import { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { debounce } from "./debounce";
import { getActiveOrVisibleEditor } from "./getActiveOrVisibleEditor";

const previouslyExecutedLineDecoration: vscode.TextEditorDecorationType =
  vscode.window.createTextEditorDecorationType({
    dark: {
      overviewRulerColor: new vscode.ThemeColor("editorGhostText.foreground"),
      borderColor: new vscode.ThemeColor("editorGhostText.foreground"),
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor("editorGhostText.foreground"),
      borderColor: new vscode.ThemeColor("editorGhostText.foreground"),
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
      borderColor: new vscode.ThemeColor(
        "editor.stackFrameHighlightBackground"
      ),
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editor.stackFrameHighlightBackground"
      ),
      borderColor: new vscode.ThemeColor(
        "editor.stackFrameHighlightBackground"
      ),
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
      borderColor: new vscode.ThemeColor("editorOverviewRuler.infoForeground"),
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      borderColor: new vscode.ThemeColor("editorOverviewRuler.infoForeground"),
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
    const editor = getActiveOrVisibleEditor();
    if (GameExecutedMessage.type.isNotification(message)) {
      const { locations, state } = message.params;
      if (state === "running") {
        const documentLocations = Object.groupBy(locations, ({ uri }) => uri);
        for (const [uri, locations] of Object.entries(documentLocations)) {
          if (editor?.document.uri.toString() === uri) {
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
          }
        }
      } else {
        previewingLines.clear();
        const documentLocations = Object.groupBy(locations, ({ uri }) => uri);
        for (const [uri, locations] of Object.entries(documentLocations)) {
          if (editor?.document.uri.toString() === uri) {
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
          }
        }
      }
    }
    if (editor) {
      debouncedUpdateDecorations(editor);
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
    Array.from(previouslyExecutedLines).map(
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
