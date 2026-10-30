import { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import {
  GameExecutedMessage,
  type ExecutedLines,
  type PreviewRoute,
} from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GamePreviewedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GamePreviewedMessage";
import { choiceSentence } from "@impower/spark-web-player/src/route/routeView";
import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { addExecutedHighlightLines } from "./executedHighlightLines";
import { getActiveOrVisibleEditor } from "./getActiveOrVisibleEditor";

const currentlyExecutedLineDecoration: vscode.TextEditorDecorationType =
  vscode.window.createTextEditorDecorationType({
    dark: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground",
      ),
      backgroundColor: "rgba(0,0,0,0.18)",
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground",
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
        "editorOverviewRuler.infoForeground",
      ),
      backgroundColor: "rgba(0,0,0,0.18)",
    },
    light: {
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.infoForeground",
      ),
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    isWholeLine: true,
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

type RouteChoiceKind = "pinned" | "auto";

const ROUTE_CHOICE_KINDS: readonly RouteChoiceKind[] = ["pinned", "auto"];

let currentlyExecutedLines = new Set<number>();
let previewingLines = new Set<number>();
let previewingRoute: PreviewRoute | undefined;
let routeChoiceDecorations:
  | Record<RouteChoiceKind, vscode.TextEditorDecorationType>
  | undefined;

export const activateExecutionLineDecorator = (
  context: vscode.ExtensionContext,
) => {
  const routeIcon = (kind: RouteChoiceKind, theme: "light" | "dark") =>
    vscode.Uri.joinPath(
      context.extensionUri,
      "out",
      "data",
      `route-${kind}-${theme}.svg`,
    );
  const routeChoiceDecoration = (kind: RouteChoiceKind) =>
    vscode.window.createTextEditorDecorationType({
      light: { gutterIconPath: routeIcon(kind, "light") },
      dark: { gutterIconPath: routeIcon(kind, "dark") },
      gutterIconSize: "contain",
    });
  routeChoiceDecorations = {
    pinned: routeChoiceDecoration("pinned"),
    auto: routeChoiceDecoration("auto"),
  };
  const handleGamePreviewed = (message: Message) => {
    if (GamePreviewedMessage.type.isNotification(message)) {
      previewingLines.clear();
      previewingRoute = undefined;
    }
  };
  const handleGameExecuted = (message: Message) => {
    const editor = getActiveOrVisibleEditor();
    if (GameExecutedMessage.type.isNotification(message)) {
      const { executedLines, state, route } = message.params;
      previewingRoute = state === "running" ? undefined : route;
      if (editor) {
        if (state === "running") {
          previewingLines.clear();
          highlightLines(currentlyExecutedLines, editor, executedLines);
        } else {
          currentlyExecutedLines.clear();
          highlightLines(previewingLines, editor, executedLines);
        }
      }
    }
    if (editor) {
      updateDecorations(editor);
    }
    updateRouteChoiceDecorationsOfAllEditors();
  };
  SparkdownPreviewGamePanelManager.instance.connection.incoming.addListener(
    GamePreviewedMessage.method,
    handleGamePreviewed,
  );
  SparkdownPreviewGamePanelManager.instance.connection.incoming.addListener(
    GameExecutedMessage.method,
    handleGameExecuted,
  );
  context.subscriptions.push({
    dispose: () => {
      SparkdownPreviewGamePanelManager.instance.connection.incoming.removeListener(
        GameExecutedMessage.method,
        handleGameExecuted,
      );
    },
  });

  const handleGameExited = (message: Message) => {
    const editor = getActiveOrVisibleEditor();
    if (GameExitedMessage.type.isNotification(message)) {
      currentlyExecutedLines.clear();
      previewingLines.clear();
      previewingRoute = undefined;
    }
    if (editor) {
      updateDecorations(editor);
    }
    updateRouteChoiceDecorationsOfAllEditors();
  };
  SparkdownPreviewGamePanelManager.instance.connection.incoming.addListener(
    GameExitedMessage.method,
    handleGameExited,
  );
  context.subscriptions.push({
    dispose: () => {
      SparkdownPreviewGamePanelManager.instance.connection.incoming.removeListener(
        GameExitedMessage.method,
        handleGameExited,
      );
    },
  });

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(() => {
      previewingLines.clear();
      previewingRoute = undefined;
      updateLineDecorationsOfAllEditors();
      updateRouteChoiceDecorationsOfAllEditors();
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() =>
      updateRouteChoiceDecorationsOfAllEditors(),
    ),
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession(() => {
      currentlyExecutedLines.clear();
      updateLineDecorationsOfAllEditors();
    }),
  );

  context.subscriptions.push({
    dispose: () => {
      currentlyExecutedLines.clear();
      previewingLines.clear();
      previewingRoute = undefined;
      updateLineDecorationsOfAllEditors();
      for (const kind of ROUTE_CHOICE_KINDS) {
        routeChoiceDecorations?.[kind].dispose();
      }
      routeChoiceDecorations = undefined;
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
  executedLines: Record<string, ExecutedLines> | undefined,
) => {
  const lines = executedLines?.[editor.document.uri.toString()];
  if (lines) {
    addExecutedHighlightLines(
      lineSet,
      lines.ranges,
      (line) => editor.document.lineAt(line).text,
    );
  }
};

const updateDecorations = (editor: vscode.TextEditor) => {
  editor.setDecorations(
    currentlyExecutedLineDecoration,
    Array.from(currentlyExecutedLines).map(
      (line) => new vscode.Range(line, 0, line, 0),
    ),
  );
  editor.setDecorations(
    previewingLineDecoration,
    Array.from(previewingLines).map(
      (line) => new vscode.Range(line, 0, line, 0),
    ),
  );
};

const updateLineDecorationsOfAllEditors = () => {
  for (const editor of vscode.window.visibleTextEditors) {
    updateDecorations(editor);
  }
};

const routeChoiceMarks = (
  editor: vscode.TextEditor,
  kind: RouteChoiceKind,
): vscode.DecorationOptions[] => {
  const route = previewingRoute;
  if (!route) {
    return [];
  }
  const uri = editor.document.uri.toString();
  return route.decisions
    .filter(
      (decision) =>
        decision.kind === kind &&
        decision.location.uri === uri &&
        decision.location.range.start.line < editor.document.lineCount,
    )
    .map((decision) => ({
      range: editor.document.lineAt(decision.location.range.start.line).range,
      hoverMessage: choiceSentence(decision, route.target),
    }));
};

const updateRouteChoiceDecorationsOfAllEditors = () => {
  if (!routeChoiceDecorations) {
    return;
  }
  for (const editor of vscode.window.visibleTextEditors) {
    for (const kind of ROUTE_CHOICE_KINDS) {
      editor.setDecorations(
        routeChoiceDecorations[kind],
        routeChoiceMarks(editor, kind),
      );
    }
  }
};
