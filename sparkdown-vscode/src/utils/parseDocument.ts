import * as vscode from "vscode";
import { parseSpark } from "../../../sparkdown";
import { fileState } from "../state/fileState";
import { parseState } from "../state/parseState";
import { updateGamePreviews } from "./updateGamePreviews";
import { updateOutline } from "./updateOutline";
import { updateScreenplayPreviews } from "./updateScreenplayPreviews";
import { updateStatus } from "./updateStatus";

export const parseDocument = (document: vscode.TextDocument) => {
  const output = parseSpark(document.getText(), {
    variables: fileState[document.uri.toString()].assets,
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
};
