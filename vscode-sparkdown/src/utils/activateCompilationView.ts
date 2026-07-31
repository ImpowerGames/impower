import { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { findClosestPathLocation } from "@impower/spark-engine/src/game/core/utils/findClosestPathLocation";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { SparkProgramManager } from "../managers/SparkProgramManager";
import { SparkdownCompilationTreeDataProvider } from "../providers/SparkdownCompilationTreeDataProvider";
import { getEditor } from "./getEditor";

let programmaticSelectionDepth = 0;

const revealSilently = async <T>(
  treeView: vscode.TreeView<T>,
  item: T,
  opts?: {
    readonly select?: boolean;
    readonly focus?: boolean;
    readonly expand?: boolean | number;
  },
) => {
  programmaticSelectionDepth++;
  try {
    await treeView.reveal(item, { select: true, focus: true, ...(opts ?? {}) });
    // Ensure the selection event has a chance to fire before we drop the guard.
    await Promise.resolve();
  } finally {
    programmaticSelectionDepth--;
  }
};
export function activateCompilationView(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "sparkdown-compilation",
      SparkdownCompilationTreeDataProvider.instance,
    ),
  );
  const treeView = vscode.window.createTreeView("sparkdown-compilation", {
    treeDataProvider: SparkdownCompilationTreeDataProvider.instance,
  });
  treeView.onDidChangeSelection(async (e) => {
    const initiatedByReveal = programmaticSelectionDepth > 0;
    if (initiatedByReveal) {
      // Ignore programmatically selected tree items
      return;
    }
    // If user selected tree item, then select the corresponding document location
    if (SparkdownCompilationTreeDataProvider.instance.uri) {
      const program = await SparkProgramManager.instance.getOrCompile(
        SparkdownCompilationTreeDataProvider.instance.uri,
      );
      if (program) {
        if (e.selection.length > 0) {
          for (const s of e.selection) {
            const path = s.id;
            const location = program.pathLocations?.[path];
            if (location) {
              const [scriptIndex, startLine, startCol, endLine, endCol] =
                location;
              const scripts = Object.keys(program.scripts);
              const fileUri = scripts[scriptIndex];
              const editor = getEditor(fileUri);
              if (editor) {
                const range = new vscode.Range(
                  new vscode.Position(startLine, startCol),
                  new vscode.Position(endLine, endCol),
                );
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(
                  range,
                  vscode.TextEditorRevealType.InCenterIfOutsideViewport,
                );
              }
            }
          }
        }
      }
    }
  });
  context.subscriptions.push(treeView);

  // With slim program notifications the compiled tree is no longer pushed to
  // us on every compile -- pull it on demand, and only while the tree view is
  // actually visible. While hidden, just remember that the data went stale.
  let treeDataStale = false;
  let treeDataUri: vscode.Uri | undefined;
  const refreshTreeData = async (uri: vscode.Uri) => {
    treeDataUri = uri;
    if (!treeView.visible) {
      treeDataStale = true;
      return;
    }
    treeDataStale = false;
    const program = await SparkProgramManager.instance.getOrCompile(uri);
    // The visible/current uri may have changed while we awaited the program.
    if (treeDataUri?.toString() === uri.toString()) {
      SparkdownCompilationTreeDataProvider.instance.setTreeData(
        uri,
        program?.compiled,
      );
    }
  };

  // Initialize provider
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId === "sparkdown") {
    refreshTreeData(editor.document.uri);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === "sparkdown") {
        refreshTreeData(editor.document.uri);
      }
    }),
  );

  const handleCompiledProgram = (
    uri: vscode.Uri,
    _program: SparkProgram | undefined,
  ) => {
    if (
      SparkdownCompilationTreeDataProvider.instance.uri?.toString() ===
        uri.toString() ||
      treeDataUri?.toString() === uri.toString()
    ) {
      refreshTreeData(uri);
    }
  };
  SparkProgramManager.instance.addListener(handleCompiledProgram);
  context.subscriptions.push({
    dispose: () => {
      SparkProgramManager.instance.removeListener(handleCompiledProgram);
    },
  });

  context.subscriptions.push(
    treeView.onDidChangeVisibility((e) => {
      if (e.visible && treeDataStale && treeDataUri) {
        refreshTreeData(treeDataUri);
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((change) => {
      const editor = change.textEditor;
      const document = editor.document;
      if (document.languageId === "sparkdown") {
        if (
          treeView.visible &&
          change.kind === vscode.TextEditorSelectionChangeKind.Mouse
        ) {
          const program = SparkProgramManager.instance.get(editor.document.uri);
          if (program) {
            const range = change.selections[0];
            if (range) {
              const [path] =
                findClosestPathLocation(
                  { file: document.uri.toString(), line: range.active.line },
                  Object.entries(program.pathLocations || {}),
                  Object.keys(program.scripts),
                ) || [];
              if (path) {
                const instructionNode =
                  SparkdownCompilationTreeDataProvider.instance.getNodeById(
                    path,
                  );
                if (instructionNode) {
                  revealSilently(treeView, instructionNode, {
                    select: true,
                    expand: true,
                    focus: false,
                  });
                }
              }
            }
          }
        }
      }
    }),
  );

  const handleGameExecuted = (message: Message) => {
    if (GameExecutedMessage.type.isNotification(message)) {
      const { executedPaths, state } = message.params;
      if (state === "running") {
        if (treeView.visible) {
          const lastExecutedPath = executedPaths.at(-1);
          if (lastExecutedPath) {
            const instructionNode =
              SparkdownCompilationTreeDataProvider.instance.getNodeById(
                lastExecutedPath,
              );
            if (instructionNode) {
              revealSilently(treeView, instructionNode, {
                select: true,
                expand: true,
                focus: false,
              });
            }
          }
        }
      }
    }
  };
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
}
