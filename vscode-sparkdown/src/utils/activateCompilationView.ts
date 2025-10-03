import { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { findClosestPathLocation } from "@impower/spark-engine/src/game/core/utils/findClosestPathLocation";
import { SparkProgram } from "@impower/sparkdown/src";
import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { SparkProgramManager } from "../managers/SparkProgramManager";
import { SparkdownCompilationTreeDataProvider } from "../providers/SparkdownCompilationTreeDataProvider";

export function activateCompilationView(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "sparkdown-compilation",
      SparkdownCompilationTreeDataProvider.instance
    )
  );
  const treeView = vscode.window.createTreeView("sparkdown-compilation", {
    treeDataProvider: SparkdownCompilationTreeDataProvider.instance,
  });
  context.subscriptions.push(treeView);

  // Initialize provider
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId === "sparkdown") {
    const program = SparkProgramManager.instance.get(editor.document.uri);
    SparkdownCompilationTreeDataProvider.instance.setTreeData(
      editor.document.uri,
      program?.compiled
    );
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === "sparkdown") {
        const program = SparkProgramManager.instance.get(editor.document.uri);
        SparkdownCompilationTreeDataProvider.instance.setTreeData(
          editor.document.uri,
          program?.compiled
        );
      }
    })
  );

  const handleCompiledProgram = (uri: vscode.Uri, program: SparkProgram) => {
    if (
      SparkdownCompilationTreeDataProvider.instance.uri?.toString() ===
      uri.toString()
    ) {
      SparkdownCompilationTreeDataProvider.instance.setTreeData(
        uri,
        program.compiled
      );
    }
  };
  SparkProgramManager.instance.addListener(handleCompiledProgram);
  context.subscriptions.push({
    dispose: () => {
      SparkProgramManager.instance.removeListener(handleCompiledProgram);
    },
  });

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((change) => {
      const editor = change.textEditor;
      const document = editor.document;
      if (document.languageId === "sparkdown") {
        if (treeView.visible) {
          const program = SparkProgramManager.instance.get(editor.document.uri);
          if (program) {
            const range = change.selections[0];
            if (range) {
              const [path] =
                findClosestPathLocation(
                  { file: document.uri.toString(), line: range.active.line },
                  Object.entries(program.pathToLocation || {}),
                  Object.keys(program.scripts)
                ) || [];
              if (path) {
                const instructionNode =
                  SparkdownCompilationTreeDataProvider.instance.getNodeById(
                    path
                  );
                if (instructionNode) {
                  treeView.reveal(instructionNode, {
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
    })
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
                lastExecutedPath
              );
            if (instructionNode) {
              treeView.reveal(instructionNode, {
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
}
