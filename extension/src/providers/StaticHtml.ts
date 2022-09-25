import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  generateSparkScriptHtml,
  generateSparkTitleHtml,
} from "../../../screenplay";
import { parseSpark } from "../../../sparkdown";
import { getDirectoryPath } from "../getDirectoryPath";
import { fileToBase64 } from "../utils/fileToBase64";
import { getActiveSparkdownDocument } from "../utils/getActiveSparkdownDocument";
import { getEditor } from "../utils/getEditor";
import { getSparkdownConfig } from "../utils/getSparkdownConfig";
import { openFile } from "../utils/openFile";
import { revealFile } from "../utils/revealFile";

export async function exportHtml() {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getEditor(uri);
  if (!editor) {
    return;
  }
  const filename = editor.document.fileName.replace(
    /(\.(sparkdown|spark|sd|md|txt))$/,
    ""
  );
  const saveUri = vscode.Uri.file(filename);
  const filepath = await vscode.window.showSaveDialog({
    filters: { "HTML File": ["html"] },
    defaultUri: saveUri,
  });
  const sparkdownConfig = getSparkdownConfig(editor.document.uri);
  const output = parseSpark(editor.document.getText(), undefined, {
    removeBlockComments: true,
    skipTokens: ["condition"],
  });

  const htmlPath = path.join(getDirectoryPath(), "data", "staticexport.html");
  let rawHtml = fs.readFileSync(htmlPath, "utf8");

  if (process.platform !== "win32") {
    rawHtml = rawHtml.replace(/\r\n/g, "\n");
  }

  let pageClasses = "innerpage";
  if (sparkdownConfig.scenes_numbers === "left") {
    pageClasses = "innerpage numberonleft";
  } else if (sparkdownConfig.scenes_numbers === "right") {
    pageClasses = "innerpage numberonright";
  } else if (sparkdownConfig.scenes_numbers === "both") {
    pageClasses = "innerpage numberonleft numberonright";
  }

  rawHtml = rawHtml.replace("$SCRIPTCLASS$", pageClasses);

  const courierPrimeB64 = fileToBase64(
    path.join(getDirectoryPath(), "data", "courier-prime.ttf")
  );
  const courierPrimeB64_bold = fileToBase64(
    path.join(getDirectoryPath(), "data", "courier-prime-bold.ttf")
  );
  const courierPrimeB64_italic = fileToBase64(
    path.join(getDirectoryPath(), "data", "courier-prime-italic.ttf")
  );
  const courierPrimeB64_bolditalic = fileToBase64(
    path.join(getDirectoryPath(), "data", "courier-prime-bold-italic.ttf")
  );

  rawHtml = rawHtml
    .replace("$COURIERPRIME$", courierPrimeB64)
    .replace("$COURIERPRIME-BOLD$", courierPrimeB64_bold)
    .replace("$COURIERPRIME-ITALIC$", courierPrimeB64_italic)
    .replace("$COURIERPRIME-BOLD-ITALIC$", courierPrimeB64_bolditalic);

  const titleHtml = generateSparkTitleHtml(output, sparkdownConfig);
  const scriptHtml = generateSparkScriptHtml(output, sparkdownConfig);

  if (titleHtml) {
    rawHtml = rawHtml.replace("$TITLEPAGE$", titleHtml);
  } else {
    rawHtml = rawHtml.replace("$TITLEDISPLAY$", "hidden");
  }
  rawHtml = rawHtml.replace("$SCREENPLAY$", scriptHtml);

  if (!filepath) {
    return;
  }

  vscode.workspace.fs.writeFile(filepath, Buffer.from(rawHtml)).then(
    () => {
      const open = "Open";
      let reveal = "Reveal in File Explorer";
      if (process.platform === "darwin") {
        reveal = "Reveal in Finder";
      }
      vscode.window
        .showInformationMessage("Exported HTML Successfully!", open, reveal)
        .then((val) => {
          switch (val) {
            case open: {
              openFile(filepath.fsPath);
              break;
            }
            case reveal: {
              revealFile(filepath.fsPath);
              break;
            }
          }
        });
    },
    (err) => {
      vscode.window.showErrorMessage("Failed to export HTML: " + err.message);
    }
  );
}
