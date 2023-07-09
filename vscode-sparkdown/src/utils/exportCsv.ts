import { generateSparkCsvData } from "@impower/spark-screenplay/src/index";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { getVisibleEditor } from "./getVisibleEditor";
import { writeFile } from "./writeFile";

export const exportCsv = async (): Promise<void> => {
  const { stringify } = require("csv-stringify");
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getVisibleEditor(uri);
  if (!editor) {
    return;
  }
  const fsPath = await getSyncOrExportPath(editor, "csv");
  if (!fsPath) {
    return;
  }
  SparkdownCommandTreeDataProvider.instance.notifyExportStarted("csv");
  const sparkdown = editor.document.getText();
  const result = ScreenplaySparkParser.instance.parse(sparkdown);
  const strings = generateSparkCsvData(result);
  await new Promise<void>((resolve) => {
    stringify(strings, {}, async (_err: Error | undefined, output: string) => {
      await writeFile(fsPath, output);
      resolve();
    });
  });
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("csv");
};
