import { GameExecutedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedMessage";
import { GameWillContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameWillContinueMessage";
import { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { debounce } from "./debounce";
import { getActiveOrVisibleEditor } from "./getActiveOrVisibleEditor";

const currentlyExecutedLineDecoration: vscode.TextEditorDecorationType =
  vscode.window.createTextEditorDecorationType({
    dark: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      backgroundColor: "rgba(0,0,0,0.04)",
    },
    isWholeLine: true,
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

const previewingLineDecoration: vscode.TextEditorDecorationType =
  vscode.window.createTextEditorDecorationType({
    dark: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      backgroundColor: "rgba(0,0,0,0.04)",
    },
    isWholeLine: true,
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

let currentlyExecutedLines = new Set<number>();
let previewingLines = new Set<number>();

export const activateExecutionGutterDecorator = (
  context: vscode.ExtensionContext
) => {
  const handleGameWillContinue = (message: Message) => {
    const editor = getActiveOrVisibleEditor();
    if (GameWillContinueMessage.type.isNotification(message)) {
      previewingLines.clear();
    }
    if (editor) {
      debouncedUpdateDecorations(editor);
    }
  };
  const handleGameExecuted = (message: Message) => {
    const editor = getActiveOrVisibleEditor();
    if (GameExecutedMessage.type.isNotification(message)) {
      const { locations, state } = message.params;
      if (state === "running") {
        previewingLines.clear();
        const documentLocations = Object.groupBy(locations, ({ uri }) => uri);
        for (const [uri, locations] of Object.entries(documentLocations)) {
          if (editor?.document.uri.toString() === uri) {
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
        currentlyExecutedLines.clear();
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
    GameWillContinueMessage.method,
    handleGameWillContinue
  );
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

  const handleGameExited = (message: Message) => {
    const editor = getActiveOrVisibleEditor();
    if (GameExitedMessage.type.isNotification(message)) {
      currentlyExecutedLines.clear();
      previewingLines.clear();
    }
    if (editor) {
      debouncedUpdateDecorations(editor);
    }
  };
  SparkdownPreviewGamePanelManager.instance.connection.incoming.addListener(
    GameExitedMessage.method,
    handleGameExited
  );
  context.subscriptions.push({
    dispose: () => {
      SparkdownPreviewGamePanelManager.instance.connection.incoming.removeListener(
        GameExitedMessage.method,
        handleGameExited
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
      currentlyExecutedLines.clear();
      updateLineDecorationsOfAllEditors();
    })
  );

  context.subscriptions.push({
    dispose: () => {
      currentlyExecutedLines.clear();
      previewingLines.clear();
      updateLineDecorationsOfAllEditors();
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
