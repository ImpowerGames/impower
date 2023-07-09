import * as vscode from "vscode";
import { SparkdownCommandFileDecorationProvider } from "../providers/SparkdownCommandFileDecorationProvider";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { parseState } from "../state/parseState";
import { exportCsv } from "./exportCsv";
import { exportHtml } from "./exportHtml";
import { exportJson } from "./exportJson";
import { exportPdf } from "./exportPdf";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getVisibleEditor } from "./getVisibleEditor";
import { shiftScenes } from "./shiftScenes";
export const activateCommandView = (context: vscode.ExtensionContext): void => {
  // Register Commands view
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "sparkdown-commands",
      SparkdownCommandTreeDataProvider.instance
    )
  );
  context.subscriptions.push(
    vscode.window.createTreeView("sparkdown-commands", {
      treeDataProvider: SparkdownCommandTreeDataProvider.instance,
    })
  );
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(
      SparkdownCommandFileDecorationProvider.instance
    )
  );

  // Jump to line command
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.jumpto", (args) => {
      const uri = getActiveSparkdownDocument();
      if (!uri) {
        return;
      }
      const editor = getVisibleEditor(uri);
      if (!editor) {
        return;
      }
      const range = editor.document.lineAt(Number(args)).range;
      editor.selection = new vscode.Selection(range.start, range.start);
      editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exportpdf", async () => {
      await exportPdf(context);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exporthtml", async () => {
      await exportHtml(context);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exportcsv", async () => {
      await exportCsv();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.exportjson", async () => {
      await exportJson();
    })
  );
  const shiftScenesUpDn = (direction: number) => {
    const uri = getActiveSparkdownDocument();
    if (!uri) {
      return;
    }
    const editor = getVisibleEditor(uri);
    if (!editor) {
      return;
    }
    const program = parseState.parsedPrograms[editor.document.uri.toString()];
    if (!program) {
      return;
    }
    /* prevent the shiftScenes() being processed again before the document is re-parsed from the previous
            shiftScenes() (like when holding down the command key) so the selection doesn't slip */
    if (
      parseState.lastShiftedParseId ===
      program.metadata?.parseTime + "_" + direction
    ) {
      return;
    }
    shiftScenes(editor, program, direction);
    parseState.lastShiftedParseId =
      program.metadata?.parseTime + "_" + direction;
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
  const uri = getActiveSparkdownDocument();
  SparkdownCommandTreeDataProvider.instance.update(uri);
  SparkdownCommandFileDecorationProvider.instance.update(uri);
};
