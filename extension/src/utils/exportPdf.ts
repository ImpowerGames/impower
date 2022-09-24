import * as vscode from "vscode";
import { parseSpark } from "../../../sparkdown";
import { createPdf } from "../pdf/pdf";
import { ExportConfig } from "../types/ExportConfig";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownConfig } from "./getSparkdownConfig";
import { openFile } from "./openFile";

export async function exportPdf(
  showSaveDialog = true,
  openFileOnSave = false,
  highlightCharacters = false
) {
  const canceled = false;
  if (canceled) {
    return;
  }

  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }

  const editor = getEditor(uri);
  if (!editor) {
    return;
  }

  const config = getSparkdownConfig(uri);

  const parsed = parseSpark(editor.document.getText());

  const exportConfig: ExportConfig = { highlighted_characters: [] };
  let filename = editor.document.fileName.replace(
    /(\.(sparkdown|sd|md|txt))$/,
    ""
  ); //screenplay.sparkdown -> screenplay
  if (highlightCharacters) {
    const highlightedCharacters =
      (await vscode.window.showQuickPick(
        Object.keys(parsed.properties?.characters || {}),
        { canPickMany: true }
      )) || [];
    exportConfig.highlighted_characters = highlightedCharacters;

    if (highlightedCharacters.length > 0) {
      const filenameCharacters = [...highlightedCharacters]; //clone array
      if (filenameCharacters.length > 3) {
        filenameCharacters.length = 3;
        filenameCharacters.push("+" + (highlightedCharacters.length - 3)); //add "+n" if there's over 3 highlighted characters
      }
      filename +=
        "(" + filenameCharacters.map((v) => v.replace(" ", "")).join(",") + ")"; //remove spaces from names and join
    }
  }
  filename += ".pdf"; //screenplay -> screenplay.pdf

  const saveUri = vscode.Uri.file(filename);
  let filepath: vscode.Uri | undefined;
  if (showSaveDialog) {
    filepath = await vscode.window.showSaveDialog({
      filters: { "PDF File": ["pdf"] },
      defaultUri: saveUri,
    });
  } else {
    filepath = saveUri;
  }
  if (filepath === undefined) {
    return;
  }
  vscode.window.withProgress(
    {
      title: "Exporting PDF...",
      location: vscode.ProgressLocation.Notification,
    },
    async (progress) => {
      if (filepath) {
        createPdf(filepath.fsPath, config, exportConfig, parsed, progress);
      }
    }
  );
  if (openFileOnSave) {
    openFile(filepath.fsPath);
  }
}
