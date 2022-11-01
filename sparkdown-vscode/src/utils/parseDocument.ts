import * as vscode from "vscode";
import { GameSparkParser } from "../classes/GameSparkParser";
import { fileState } from "../state/fileState";
import { parseState } from "../state/parseState";
import { updateGamePreviews } from "./updateGamePreviews";
import { updateOutline } from "./updateOutline";
import { updateScreenplayPreviews } from "./updateScreenplayPreviews";
import { updateStatus } from "./updateStatus";

export const parseSparkDocument = (document: vscode.TextDocument) => {
  performance.mark("parseSparkDocument-start");
  const output = GameSparkParser.instance.parse(document.getText(), {
    augmentations: { variables: fileState[document.uri.toString()]?.assets },
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
  performance.mark("parseSparkDocument-end");
  performance.measure(
    "parseSparkDocument",
    "parseSparkDocument-start",
    "parseSparkDocument-end"
  );
};
