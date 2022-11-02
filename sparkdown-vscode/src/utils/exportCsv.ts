import { generateSparkStrings } from "../../../spark-screenplay";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { writeFile } from "./writeFile";

export const exportCsv = async (): Promise<void> => {
  const { stringify } = require("csv-stringify");
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getEditor(uri);
  if (!editor) {
    return;
  }
  const fsPath = await getSyncOrExportPath(editor, "csv");
  if (!fsPath) {
    return;
  }
  const sparkdown = editor.document.getText();
  const result = ScreenplaySparkParser.instance.parse(sparkdown);
  const strings = generateSparkStrings(result);
  stringify(strings, (_err: string, output: string) => {
    writeFile(fsPath, output);
  });
};
