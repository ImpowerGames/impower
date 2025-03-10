import * as vscode from "vscode";
import { SparkProgramManager } from "../managers/SparkProgramManager";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { writeFile } from "./writeFile";

export const exportJson = async (): Promise<void> => {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getEditor(uri);
  if (!editor) {
    return;
  }
  const fsPath = await getSyncOrExportPath(editor, "json");
  if (!fsPath) {
    return;
  }
  const program = SparkProgramManager.instance.get(uri);
  if (!program) {
    vscode.window.showWarningMessage(
      "Still compiling program... Try again later.",
      "OK"
    );
    return;
  }
  SparkdownCommandTreeDataProvider.instance.notifyExportStarted("json");
  await new Promise<void>(async (resolve) => {
    await writeFile(fsPath, JSON.stringify(program));
    resolve();
  });
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("json");
};
