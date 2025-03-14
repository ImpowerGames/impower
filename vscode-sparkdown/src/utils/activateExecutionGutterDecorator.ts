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

let executedLines: Map<number, Set<number>> = new Map();

export const activateExecutionGutterDecorator = (
  context: vscode.ExtensionContext
) => {
  const handleGameExecuted = (message: Message) => {
    if (GameExecutedMessage.type.isNotification(message)) {
      const { location, frameId } = message.params;
      const line = location.range.start.line;
      const editor = getEditor(location.uri);
      if (!editor) {
        return;
      }
      addExecutedLine(line, frameId);
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
    vscode.debug.onDidTerminateDebugSession(() => {
      clearExecutedLines();
    })
  );

  context.subscriptions.push({
    dispose: () => {
      clearExecutedLines();
      if (previouslyExecutedLineDecoration) {
        previouslyExecutedLineDecoration.dispose();
      }
      if (currentlyExecutedLineDecoration) {
        currentlyExecutedLineDecoration.dispose();
      }
    },
  });
};

const addExecutedLine = (lineNumber: number, frameId: number) => {
  const range = new vscode.Range(lineNumber, 0, lineNumber, 0);
  if (!executedLines.has(frameId)) {
    executedLines.set(frameId, new Set());
  }
  executedLines.get(frameId)!.add(range.start.line);
};

const debouncedUpdateDecorations = debounce((editor: vscode.TextEditor) => {
  updateDecorations(editor);
}, 100);

const updateDecorations = (editor: vscode.TextEditor) => {
  // Clear decorations before applying new ones
  editor.setDecorations(previouslyExecutedLineDecoration, []);
  editor.setDecorations(currentlyExecutedLineDecoration, []);

  // Get the most recent frame
  const latestFrameId = executedLines.size - 1;

  const currentlyExecutedLines: vscode.Range[] = [];
  const previouslyExecutedLines: vscode.Range[] = [];

  // Use a Set to ensure uniqueness of previously executed lines
  const uniqueCurrentlyExecutedLines = new Set<number>();
  const uniquePreviouslyExecutedLines = new Set<number>();

  const latestExecutedLines = executedLines.get(latestFrameId);
  if (latestExecutedLines) {
    for (const line of latestExecutedLines) {
      const key = line; // Use line number as a key
      if (!uniqueCurrentlyExecutedLines.has(key)) {
        uniqueCurrentlyExecutedLines.add(key);
        currentlyExecutedLines.push(new vscode.Range(line, 0, line, 0));
      }
    }
  }

  executedLines.forEach((lines, frameId) => {
    if (frameId !== latestFrameId) {
      for (const line of lines) {
        const key = line; // Use line number as a key
        if (
          !uniquePreviouslyExecutedLines.has(key) &&
          !uniqueCurrentlyExecutedLines.has(key)
        ) {
          uniquePreviouslyExecutedLines.add(key);
          previouslyExecutedLines.push(new vscode.Range(line, 0, line, 0));
        }
      }
    }
  });

  // Apply new decorations
  editor.setDecorations(
    previouslyExecutedLineDecoration,
    previouslyExecutedLines
  );
  editor.setDecorations(
    currentlyExecutedLineDecoration,
    currentlyExecutedLines
  );
};

const clearExecutedLines = () => {
  executedLines.clear();
  for (const editor of vscode.window.visibleTextEditors) {
    updateDecorations(editor);
  }
};
