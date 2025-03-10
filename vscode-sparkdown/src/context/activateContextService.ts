import { ExtensionContext } from "vscode";
import { ContextServiceManager } from "./ContextServiceManager";

export const activateContextService = (context: ExtensionContext) => {
  const manager = new ContextServiceManager();
  context.subscriptions.push(manager);
  manager.activate(context);
};
