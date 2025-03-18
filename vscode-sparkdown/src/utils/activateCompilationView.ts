import { GameExecutedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExecutedMessage";
import { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
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

  const handleGameExecuted = (message: Message) => {
    if (GameExecutedMessage.type.isNotification(message)) {
      const { path } = message.params;
      const instructionNode =
        SparkdownCompilationTreeDataProvider.instance.getNodeById(path);
      if (instructionNode) {
        treeView.reveal(instructionNode, {
          select: true,
          expand: true,
          focus: true,
        });
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
    vscode.debug.onDidTerminateDebugSession(() => {
      const instructionNode =
        SparkdownCompilationTreeDataProvider.instance.getNodeById("");
      if (instructionNode) {
        treeView.reveal(instructionNode, {
          select: true,
          expand: true,
          focus: true,
        });
      }
    })
  );
}
