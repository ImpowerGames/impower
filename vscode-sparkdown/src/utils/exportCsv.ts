import { generateScreenplayCsvData } from "@impower/sparkdown-screenplay/src/utils/generateScreenplayCsvData";
import ScreenplayParser from "@impower/sparkdown-screenplay/src/classes/ScreenplayParser";
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
  // TODO: include all scripts relative to main.sd
  const script = editor.document.getText();
  const parser = new ScreenplayParser();
  const tokens = parser.parseAll([script]);
  const strings = generateScreenplayCsvData(tokens);
  await new Promise<void>((resolve) => {
    stringify(strings, {}, async (_err: Error | undefined, output: string) => {
      await writeFile(fsPath, output);
      resolve();
    });
  });
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("csv");
};
