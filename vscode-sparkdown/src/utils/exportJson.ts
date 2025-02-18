import { GameSparkParser } from "../classes/GameSparkParser";
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
  SparkdownCommandTreeDataProvider.instance.notifyExportStarted("json");
  // TODO: include all scripts relative to main.sd
  const script = editor.document.getText();
  const result = GameSparkParser.instance.parse(script);
  const output = JSON.stringify(result);
  await writeFile(fsPath, output);
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("json");
};
