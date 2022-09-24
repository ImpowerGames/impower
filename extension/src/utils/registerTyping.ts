import * as vscode from "vscode";
import { typingState } from "../state/typingState";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getSparkdownConfig } from "./getSparkdownConfig";

export const registerTyping = (): void => {
  try {
    const uri = getActiveSparkdownDocument();
    if (!uri) {
      return;
    }
    const config = getSparkdownConfig(uri);
    if (config.parenthetical_newline_helper) {
      typingState.disposeTyping = vscode.commands.registerCommand(
        "type",
        (args) => {
          //Automatically skip to the next line at the end of parentheticals
          if (args.text === "\n") {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
              return;
            }
            if (editor.selection.isEmpty) {
              const position = editor.selection.active;
              const lineText = editor.document.getText(
                new vscode.Range(
                  new vscode.Position(position.line, 0),
                  new vscode.Position(position.line, 256)
                )
              );
              if (position.character === lineText.length - 1) {
                if (
                  lineText.match(/^\s*\(.*\)$/g) ||
                  lineText.match(
                    /^\s*((([A-Z0-9 ]+|@.*)(\([A-z0-9 '\-.()]+\))+|)$)/
                  )
                ) {
                  const newPos = new vscode.Position(
                    position.line,
                    lineText.length
                  );
                  editor.selection = new vscode.Selection(newPos, newPos);
                }
              }
            }
          }
          vscode.commands.executeCommand("default:type", {
            text: args.text,
          });
        }
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
