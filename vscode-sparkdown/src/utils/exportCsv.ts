import { generateSparkCsvData } from "@impower/spark-screenplay/src/index";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { commandViewProvider } from "../state/commandViewProvider";
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
  commandViewProvider.notifyExportStarted("csv");
  const sparkdown = editor.document.getText();
  const result = ScreenplaySparkParser.instance.parse(sparkdown);
  const strings = generateSparkCsvData(result);
  await new Promise<void>((resolve) => {
    stringify(strings, {}, async (_err: Error | undefined, output: string) => {
      await writeFile(fsPath, output);
      resolve();
    });
  });
  commandViewProvider.notifyExportEnded("csv");
};
