import * as vscode from "vscode";
import { parseSpark } from "../../../sparkdown";
import { previews } from "../providers/Preview";
import { exportHtml } from "../providers/StaticHtml";
import { commandViewProvider } from "../state/commandViewProvider";
import { editorState } from "../state/editorState";
import { exportPdf } from "./exportPdf";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownConfig } from "./getSparkdownConfig";
import { shiftScenes } from "./shiftScenes";

export const activateCommandView = (context: vscode.ExtensionContext): void => {
  // Register Commands view
  vscode.window.registerTreeDataProvider(
    "sparkdown-commands",
    commandViewProvider
  );
  vscode.window.createTreeView("sparkdown-commands", {
    treeDataProvider: commandViewProvider,
  });

  // Jump to line command
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.jumpto", (args) => {
      const uri = getActiveSparkdownDocument();
      if (!uri) {
        return;
      }
      const editor = getEditor(uri);
      if (!editor) {
        return;
      }
      const range = editor.document.lineAt(Number(args)).range;
      editor.selection = new vscode.Selection(range.start, range.start);
      editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
      //If live screenplay is visible scroll to it with
      if (
        getSparkdownConfig(editor.document.uri)
          .screenplay_preview_synchronized_with_cursor
      ) {
        previews.forEach((p) => {
          if (p.uri === editor.document.uri.toString()) {
            p.panel.webview.postMessage({ command: "scrollTo", content: args });
          }
        });
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exportpdf", async () =>
      exportPdf()
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exportpdfdebug", async () =>
      exportPdf(false, true)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exporthtml", async () =>
      exportHtml()
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.debugtokens", () => {
      const uri = getActiveSparkdownDocument();
      if (!uri) {
        return;
      }
      const editor = getEditor(uri);
      if (!editor) {
        return;
      }
      const sparkdown = editor.document.getText();
      vscode.workspace
        .openTextDocument({ language: "json" })
        .then((doc) => vscode.window.showTextDocument(doc))
        .then((editor) => {
          const editBuilder = (textEdit: vscode.TextEditorEdit) => {
            textEdit.insert(
              new vscode.Position(0, 0),
              JSON.stringify(
                parseSpark(sparkdown, undefined, {
                  removeBlockComments: true,
                  skipTokens: ["condition"],
                }),
                null,
                4
              )
            );
          };
          return editor.edit(editBuilder, {
            undoStopBefore: true,
            undoStopAfter: false,
          });
        });
    })
  );
  const shiftScenesUpDn = (direction: number) => {
    const uri = getActiveSparkdownDocument();
    if (!uri) {
      return;
    }
    const editor = getEditor(uri);
    if (!editor) {
      return;
    }
    const parsed = editorState.parsedDocuments[editor.document.uri.toString()];
    if (!parsed) {
      return;
    }
    /* prevent the shiftScenes() being processed again before the document is re-parsed from the previous
            shiftScenes() (like when holding down the command key) so the selection doesn't slip */
    if (editorState.lastShiftedParseId === parsed.parseTime + "_" + direction) {
      return;
    }
    shiftScenes(editor, parsed, direction);
    editorState.lastShiftedParseId = parsed.parseTime + "_" + direction;
  };
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.shiftScenesUp", () =>
      shiftScenesUpDn(-1)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.shiftScenesDown", () =>
      shiftScenesUpDn(1)
    )
  );
};