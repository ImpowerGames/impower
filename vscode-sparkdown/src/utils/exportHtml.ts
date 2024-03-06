import { generateSparkHtmlData } from "@impower/sparkdown-screenplay/src/index";
import * as vscode from "vscode";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getFonts } from "./getFonts";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { writeFile } from "./writeFile";

export const exportHtml = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getEditor(uri);
  if (!editor) {
    return;
  }
  const fsPath = await getSyncOrExportPath(editor, "html");
  if (!fsPath) {
    return;
  }
  SparkdownCommandTreeDataProvider.instance.notifyExportStarted("html");
  const sparkdown = editor.document.getText();
  const result = ScreenplaySparkParser.instance.parse(sparkdown);
  const config = getSparkdownPreviewConfig(uri);
  const fonts = await getFonts(context);
  const rawHtml: string = generateSparkHtmlData(result, config, fonts);
  const output =
    process?.platform !== "win32" ? rawHtml.replace(/\r\n/g, "\n") : rawHtml;
  await writeFile(fsPath, output);
  SparkdownCommandTreeDataProvider.instance.notifyExportEnded("html");
};
