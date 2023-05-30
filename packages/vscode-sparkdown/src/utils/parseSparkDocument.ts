import * as vscode from "vscode";
import { GameSparkParser } from "../classes/GameSparkParser";
import { fileState } from "../state/fileState";
import { parseState } from "../state/parseState";
import { updateDiagnostics } from "./updateDiagnostics";
import { updateGamePreviews } from "./updateGamePreviews";
import { updateOutline } from "./updateOutline";
import { updateScreenplayPreviews } from "./updateScreenplayPreviews";
import { updateStatus } from "./updateStatus";

export const parseSparkDocument = (document: vscode.TextDocument) => {
  performance.mark("parseSparkDocument-start");
  const structs = fileState[document.uri.toString()]?.assets;
  const output = GameSparkParser.instance.parse(document.getText(), {
    augmentations: { structs },
  });
  parseState.lastParsedUri = document.uri.toString();
  parseState.parsedDocuments[parseState.lastParsedUri] = output;
  updateScreenplayPreviews(document);
  updateGamePreviews(document);
  updateOutline(document);
  updateStatus(
    output.properties?.actionDuration || 0,
    output.properties?.dialogueDuration || 0
  );
  updateDiagnostics(document.uri, output.diagnostics);
  performance.mark("parseSparkDocument-end");
  performance.measure(
    "parseSparkDocument",
    "parseSparkDocument-start",
    "parseSparkDocument-end"
  );
};
