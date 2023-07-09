import * as vscode from "vscode";
import { GameSparkParser } from "../classes/GameSparkParser";
import { fileState } from "../state/fileState";
import { parseState } from "../state/parseState";
import { updateOutline } from "./updateOutline";
import { updateStatus } from "./updateStatus";

export const parseSparkDocument = (
  context: vscode.ExtensionContext,
  document: vscode.TextDocument
) => {
  performance.mark("parseSparkDocument-start");
  const structs = fileState[document.uri.toString()]?.assets;
  const program = GameSparkParser.instance.parse(document.getText(), {
    augmentations: { structs },
  });
  parseState.lastParsedUri = document.uri.toString();
  parseState.parsedPrograms[parseState.lastParsedUri] = program;
  // TODO: updateGamePreviews(document);
  updateOutline(context, document);
  updateStatus(
    program?.metadata?.actionDuration || 0,
    program?.metadata?.dialogueDuration || 0
  );
  performance.mark("parseSparkDocument-end");
  performance.measure(
    "parseSparkDocument",
    "parseSparkDocument-start",
    "parseSparkDocument-end"
  );
};
