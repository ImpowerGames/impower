import * as vscode from "vscode";
import { parseState } from "../state/parseState";

export const updateGamePreviews = (doc: vscode.TextDocument) => {
  performance.mark("updateGamePreviews-start");
  const uri = doc.uri;
  const program = parseState.parsedPrograms[uri.toString()];
  console.log(program);
  // TODO:
  // const gamePreviewsToUpdate = getPreviewPanelsToUpdate("game", uri);
  // if (program && gamePreviewsToUpdate && gamePreviewsToUpdate?.length > 0) {
  //   for (let i = 0; i < gamePreviewsToUpdate.length; i++) {
  //     const preview = gamePreviewsToUpdate[i];
  //     if (preview) {
  //       const structs = program?.structs || {};
  //       Object.entries(structs).forEach(([k]) => {
  //         const fieldObj = structs[k]?.fields?.["src"];
  //         if (
  //           fieldObj &&
  //           fieldObj.value &&
  //           typeof fieldObj.value === "string"
  //         ) {
  //           fieldObj.value = preview.panel.webview
  //             .asWebviewUri(vscode.Uri.file(fieldObj.value))
  //             ?.toString();
  //         }
  //       });
  //       preview.panel.webview.postMessage({
  //         command: "sparkdown.updateParsedJson",
  //         content: JSON.stringify(
  //           GameSparkParser.instance.parse(doc.getText(), {
  //             augmentations: { structs },
  //           })
  //         ),
  //       });
  //       if (preview.dynamic) {
  //         preview.uri = uri.toString();
  //         preview.panel.webview.postMessage({
  //           command: "sparkdown.setstate",
  //           uri: preview.uri,
  //         });
  //       }
  //     }
  //   }
  //   performance.mark("updateGamePreviews-end");
  //   performance.measure(
  //     "updateGamePreviews",
  //     "updateGamePreviews-start",
  //     "updateGamePreviews-end"
  //   );
  // }
};
