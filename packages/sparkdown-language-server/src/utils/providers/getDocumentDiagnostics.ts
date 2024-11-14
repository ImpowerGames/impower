import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { PublishDiagnosticsParams } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { clampRange } from "../document/clampRange";

export const getDocumentDiagnostics = (
  document: TextDocument,
  program: SparkProgram
): PublishDiagnosticsParams => {
  if (program.diagnostics) {
    const diagnostics = program.diagnostics[document.uri] || [];
    for (const d of diagnostics) {
      clampRange(document, d.range);
      d.relatedInformation?.forEach((info) => {
        clampRange(document, info.location.range);
      });
    }
    return { uri: document.uri, diagnostics };
  }
  return { uri: document.uri, diagnostics: [] };
};
