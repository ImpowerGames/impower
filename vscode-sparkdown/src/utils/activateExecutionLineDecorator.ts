import { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GamePreviewedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GamePreviewedMessage";
import * as vscode from "vscode";
import { Location } from "vscode-languageclient";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { getActiveOrVisibleEditor } from "./getActiveOrVisibleEditor";

const currentlyExecutedLineDecoration: vscode.TextEditorDecorationType =
  vscode.window.createTextEditorDecorationType({
    dark: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      backgroundColor: "rgba(0,0,0,0.18)",
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      backgroundColor: "rgba(255,255,255,0.04)",
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
      backgroundColor: "rgba(0,0,0,0.18)",
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground"
      ),
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    isWholeLine: true,
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

let currentlyExecutedLines = new Set<number>();
let previewingLines = new Set<number>();

export const activateExecutionLineDecorator = (
  context: vscode.ExtensionContext
) => {
  const handleGamePreviewed = (message: Message) => {
    if (GamePreviewedMessage.type.isNotification(message)) {
      previewingLines.clear();
    }
  };
  const handleGameExecuted = (message: Message) => {
    const editor = getActiveOrVisibleEditor();
    if (editor) {
      if (GameExecutedMessage.type.isNotification(message)) {
        const { locations, state } = message.params;
        if (state === "running") {
          previewingLines.clear();
          highlightLines(currentlyExecutedLines, editor, locations);
        } else {
          currentlyExecutedLines.clear();
          highlightLines(previewingLines, editor, locations);
        }
      }
    }
    if (editor) {
      updateDecorations(editor);
    }
  };
  SparkdownPreviewGamePanelManager.instance.connection.incoming.addListener(
    GamePreviewedMessage.method,
    handleGamePreviewed
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
      updateDecorations(editor);
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

const highlightLines = (
  lineSet: Set<number>,
  editor: vscode.TextEditor,
  locations: Location[]
) => {
  const documentLocations = Object.groupBy(locations, ({ uri }) => uri);
  for (const [uri, locations] of Object.entries(documentLocations)) {
    if (editor?.document.uri.toString() === uri) {
      if (locations) {
        const sortedLocations = Array.from(
          locations.sort((a, b) => a.range.start.line - b.range.start.line)
        );
        let prevEndLine: number | undefined = undefined;
        for (const location of sortedLocations) {
          if (prevEndLine != null) {
            const consecutiveBlankLines: Set<number> = new Set();
            for (let i = prevEndLine + 1; i < location.range.start.line; i++) {
              const trimmedLineText = editor.document.lineAt(i).text.trim();
              if (!trimmedLineText || trimmedLineText.startsWith("//")) {
                // also highlight empty lines between executed lines
                consecutiveBlankLines.add(i);
              } else {
                // non-blank line, so this is not a connective gap between executed lines
                consecutiveBlankLines.clear();
                break;
              }
            }
            for (const i of consecutiveBlankLines) {
              lineSet.add(i);
            }
          }
          for (
            let i = location.range.start.line;
            i <= location.range.end.line;
            i++
          ) {
            // highlight executed lines
            lineSet.add(i);
          }
          prevEndLine = location.range.end.line;
        }
      }
    }
  }
};

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
