import { RuntimeDiagnosticsMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage";
import type { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { SparkProgramManager } from "../managers/SparkProgramManager";

export function activateRuntimeDiagnostics(context: vscode.ExtensionContext) {
  const connection = SparkdownPreviewGamePanelManager.instance.connection;
  const relay = async (message: Message) => {
    if (RuntimeDiagnosticsMessage.type.isNotification(message)) {
      const client = await SparkProgramManager.instance.languageClientReady;
      await client.sendNotification(
        RuntimeDiagnosticsMessage.method,
        message.params,
      );
    }
  };
  connection.incoming.addListener(RuntimeDiagnosticsMessage.method, relay);
  context.subscriptions.push({
    dispose: () =>
      connection.incoming.removeListener(RuntimeDiagnosticsMessage.method, relay),
  });
}
