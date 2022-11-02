import * as vscode from "vscode";
import {
  generateSparkScriptHtml,
  generateSparkTitleHtml,
} from "../../../spark-screenplay";
import { ScreenplaySparkParser } from "../classes/ScreenplaySparkParser";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownConfig } from "./getSparkdownConfig";
import { getSyncOrExportPath } from "./getSyncOrExportPath";
import { readTextFile } from "./readTextFile";
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
  const sparkdown = editor.document.getText();
  const result = ScreenplaySparkParser.instance.parse(sparkdown);

  const config = getSparkdownConfig(uri);

  let rawHtml: string =
    (await readTextFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "staticexport.html"
      )
    )) || "";

  if (process.platform !== "win32") {
    rawHtml = rawHtml.replace(/\r\n/g, "\n");
  }

  let pageClasses = "innerpage";
  if (config.screenplay_print_scene_numbers === "left") {
    pageClasses = "innerpage numberonleft";
  } else if (config.screenplay_print_scene_numbers === "right") {
    pageClasses = "innerpage numberonright";
  } else if (config.screenplay_print_scene_numbers === "both") {
    pageClasses = "innerpage numberonleft numberonright";
  }

  rawHtml = rawHtml.replace("$SCRIPTCLASS$", pageClasses);

  const [
    courierPrimeB64,
    courierPrimeB64_bold,
    courierPrimeB64_italic,
    courierPrimeB64_bolditalic,
  ] = await Promise.all([
    readTextFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime.ttf"
      ),
      "base64"
    ),
    readTextFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime-bold.ttf"
      ),
      "base64"
    ),
    readTextFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime-italic.ttf"
      ),
      "base64"
    ),
    readTextFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "out",
        "data",
        "courier-prime-bold-italic.ttf"
      ),
      "base64"
    ),
  ]);

  rawHtml = rawHtml
    .replace("$COURIERPRIME$", courierPrimeB64 || "")
    .replace("$COURIERPRIME-BOLD$", courierPrimeB64_bold || "")
    .replace("$COURIERPRIME-ITALIC$", courierPrimeB64_italic || "")
    .replace("$COURIERPRIME-BOLD-ITALIC$", courierPrimeB64_bolditalic || "");

  const titleHtml = generateSparkTitleHtml(result, config);
  const scriptHtml = generateSparkScriptHtml(result, config);

  if (titleHtml) {
    rawHtml = rawHtml.replace("$TITLEPAGE$", titleHtml);
  } else {
    rawHtml = rawHtml.replace("$TITLEDISPLAY$", "hidden");
  }
  rawHtml = rawHtml.replace("$SCREENPLAY$", scriptHtml);

  if (!fsPath) {
    return;
  }

  writeFile(fsPath, rawHtml);
};
