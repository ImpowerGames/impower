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
  const program = GameSparkParser.instance.parse(document.getText(), {
    augmentations: { structs },
  });
  parseState.lastParsedUri = document.uri.toString();
  parseState.parsedPrograms[parseState.lastParsedUri] = program;
  updateScreenplayPreviews(document);
  updateGamePreviews(document);
  updateOutline(document);
  updateStatus(
    program?.metadata?.actionDuration || 0,
    program?.metadata?.dialogueDuration || 0
  );
  updateDiagnostics(document.uri, program.diagnostics);
  performance.mark("parseSparkDocument-end");
  performance.measure(
    "parseSparkDocument",
    "parseSparkDocument-start",
    "parseSparkDocument-end"
  );
};
