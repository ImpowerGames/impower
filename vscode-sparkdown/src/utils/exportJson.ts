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
  const program = await SparkProgramManager.instance.getOrCompile(uri);
  if (!program) {
    vscode.window.showWarningMessage(
      "Still compiling program... Try again later.",
      "OK",
    );
    return;
  }
  SparkdownCommandTreeDataProvider.instance.notifyExportStarted("json");
  await new Promise<void>(async (resolve) => {
    // The program's path-location ranges are one typed array; write them as
    // an array of numbers rather than as an object keyed by position.
    await writeFile(
      fsPath,
      JSON.stringify(program, (_key, value) =>
        ArrayBuffer.isView(value) ? Array.from(value as never) : value,
      ),
    );
    resolve();
  });
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("json");
};
