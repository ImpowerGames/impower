import { ExtensionContext } from "vscode";
import { ContextServiceManager } from "./ContextServiceManager";

export const activateContextService = (context: ExtensionContext) => {
  context.subscriptions.push(new ContextServiceManager());
};
