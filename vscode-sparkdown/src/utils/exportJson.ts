import { generateScreenplayJsonData } from "@impower/sparkdown-screenplay/src/index";
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
  const sparkdown = editor.document.getText();
  const result = GameSparkParser.instance.parse(sparkdown);
  const output = generateScreenplayJsonData(result);
  await writeFile(fsPath, output);
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("json");
};
