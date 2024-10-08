import { generateSparkCsvData } from "@impower/sparkdown-screenplay/src/index";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
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
  SparkdownCommandTreeDataProvider.instance.notifyExportStarted("csv");
  const sparkdown = editor.document.getText();
  const result = ScreenplaySparkParser.instance.parse(sparkdown);
  const strings = generateSparkCsvData(result.tokens);
  await new Promise<void>((resolve) => {
    stringify(strings, {}, async (_err: Error | undefined, output: string) => {
      await writeFile(fsPath, output);
      resolve();
    });
  });
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("csv");
};
