import { ExtensionContext, commands } from "vscode";
import { SparkEditorWebview } from "./SparkEditorWebview";

export function activate(context: ExtensionContext) {
  const command = commands.registerCommand("spark.showEditor", () => {
    SparkEditorWebview.render(context.extensionUri);
  });
  context.subscriptions.push(command);
}
