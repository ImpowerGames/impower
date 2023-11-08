import * as vscode from "vscode";
import CONFIG from "../../language/sparkdown.language-config.json";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";

const handleNewline = (args: { text: string }): boolean => {
  const editor = vscode.window.activeTextEditor;

  if (!editor || !editor.selection.isEmpty || args.text !== "\n") {
    return false;
  }

  const position = editor.selection.active;
  const lineText = editor.document.getText(
    new vscode.Range(
      new vscode.Position(position.line, 0),
      new vscode.Position(position.line, Number.MAX_SAFE_INTEGER)
    )
  );
  const previousLineText =
    position.line > 0
      ? editor.document.getText(
          new vscode.Range(
            new vscode.Position(position.line - 1, 0),
            new vscode.Position(position.line - 1, Number.MAX_SAFE_INTEGER)
          )
        )
      : "";
  const beforeText = lineText.slice(0, position.character + 1);
  const afterText = lineText.slice(position.character);

  for (let i = 0; i < CONFIG.onEnterRules.length; i += 1) {
    const onEnterRule = CONFIG.onEnterRules[i]!;
    const beforeTextRegex =
      "beforeText" in onEnterRule && typeof onEnterRule.beforeText === "string"
        ? new RegExp(onEnterRule.beforeText)
        : undefined;
    const afterTextRegex =
      "afterText" in onEnterRule && typeof onEnterRule.afterText === "string"
        ? new RegExp(onEnterRule.afterText)
        : undefined;
    const previousLineTextRegex =
      "previousLineText" in onEnterRule &&
      typeof onEnterRule.previousLineText === "string"
        ? new RegExp(onEnterRule.previousLineText)
        : undefined;
    if (beforeTextRegex && !beforeTextRegex.test(beforeText)) {
      continue;
    }
    if (afterTextRegex && !afterTextRegex.test(afterText)) {
      continue;
    }
    if (
      previousLineTextRegex &&
      !previousLineTextRegex.test(previousLineText)
    ) {
      continue;
    }
    // Delete empty marks
    if (
      onEnterRule.action.deleteText &&
      beforeText.endsWith(onEnterRule.action.deleteText)
    ) {
      editor.insertSnippet(
        new vscode.SnippetString(""),
        new vscode.Range(
          new vscode.Position(
            position.line,
            lineText.length - onEnterRule.action.deleteText.length
          ),
          new vscode.Position(position.line, lineText.length)
        )
      );
      return true;
    }
  }

  return false;
};

export const activateNewlineHelper = (
  context: vscode.ExtensionContext
): void => {
  try {
    const uri = getActiveSparkdownDocument();
    if (!uri) {
      return;
    }
    const config = getSparkdownPreviewConfig(uri);
    if (config.editor_newline_helper) {
      context.subscriptions.push(
        vscode.commands.registerCommand("type", (args) => {
          if (!handleNewline(args)) {
            vscode.commands.executeCommand("default:type", {
              text: args.text,
            });
          }
        })
      );
    }
  } catch {
    const moreDetails = "More details";
    const openGithub1 = "View issue on vscode repo";
    vscode.window
      .showInformationMessage(
        "Conflict with another extension! The 'type' command for vscode can only be registered by a single extension. You may want to disable the 'Parenthetical New Line Helper' setting in order to avoid further conflicts from Sparkdown",
        moreDetails,
        openGithub1
      )
      .then((val) => {
        switch (val) {
          case moreDetails: {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://github.com/piersdeseilligny/betterfountain/issues/84"
              )
            );
            break;
          }
          case openGithub1: {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://github.com/Microsoft/vscode/issues/13441"
              )
            );
            break;
          }
        }
      });
  }
};
