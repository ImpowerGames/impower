import * as vscode from "vscode";

export type SparkdownUIPersistence = {
  [key: string]: boolean;
  outline_visibleSynopses: boolean;
  outline_visibleNotes: boolean;
  outline_visibleSections: boolean;
  outline_visibleScenes: boolean;
};

export const uiPersistence: SparkdownUIPersistence = {
  outline_visibleSynopses: true,
  outline_visibleNotes: true,
  outline_visibleScenes: true,
  outline_visibleSections: true,
};

let extensionContext: vscode.ExtensionContext;
export const activateUIPersistence = function (
  context: vscode.ExtensionContext
) {
  // Create the ui persistence save file
  extensionContext = context;
  context.globalState.keys().forEach((k) => {
    const v = context.globalState.get<boolean>(k);
    if (v !== undefined) {
      uiPersistence[k] = v;
    }
  });
  for (const k in uiPersistence) {
    vscode.commands.executeCommand(
      "setContext",
      "sparkdown.uipersistence." + k,
      uiPersistence[k]
    );
  }
};

export const changeSparkdownUIPersistence = function (
  key:
    | "outline_visibleSynopses"
    | "outline_visibleNotes"
    | "outline_visibleSections"
    | "outline_visibleScenes",
  value: boolean
) {
  if (extensionContext) {
    extensionContext.globalState.update(key, value);
    uiPersistence[key] = value;
    vscode.commands.executeCommand(
      "setContext",
      "sparkdown.uipersistence." + key,
      value
    );
  }
};
