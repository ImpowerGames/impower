import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import type { PublishDiagnosticsParams } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import clampRange from "./clampRange";

const getDocumentDiagnostics = (
  document: TextDocument,
  program: SparkProgram
): PublishDiagnosticsParams => {
  if (program.diagnostics) {
    const lastLineIndex = document.lineCount - 1;
    const lastCharacterInLineIndex = document.positionAt(
      Number.MAX_SAFE_INTEGER
    ).character;
    const diagnostics = program.diagnostics.filter(
      (d) =>
        !d.relatedInformation ||
        d.relatedInformation?.some((l) => l.location.uri === document.uri)
    );
    diagnostics.forEach((d) => {
      clampRange(d.range, lastLineIndex, lastCharacterInLineIndex);
      d.relatedInformation?.forEach((info) => {
        clampRange(
          info.location.range,
          lastLineIndex,
          lastCharacterInLineIndex
        );
      });
    });
    return { uri: document.uri, diagnostics };
  }
  return { uri: document.uri, diagnostics: [] };
};

export default getDocumentDiagnostics;
