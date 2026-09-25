import { RuntimeDiagnosticsMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/RuntimeDiagnosticsMessage";
import type { Message } from "@impower/spark-editor-protocol/src/types/base/Message";
import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { SparkProgramManager } from "../managers/SparkProgramManager";

/**
 * Pass the Game Preview player's runtime errors and warnings to the language
 * server, which shows them in the Problems panel beside the compile's. The
 * player reports its current run whole each time it changes.
 */
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
