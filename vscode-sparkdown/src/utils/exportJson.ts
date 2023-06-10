import { generateSparkJsonData } from "@impower/spark-screenplay/src/index";
import { GameSparkParser } from "../classes/GameSparkParser";
import { commandViewProvider } from "../state/commandViewProvider";
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
  commandViewProvider.notifyExportStarted("json");
  const sparkdown = editor.document.getText();
  const result = GameSparkParser.instance.parse(sparkdown);
  console.log(result);
  const output = generateSparkJsonData(result);
  await writeFile(fsPath, output);
  commandViewProvider.notifyExportEnded("json");
};
