import { type PublishDiagnosticsParams } from "vscode-languageserver";

import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";

export const getDocumentDiagnostics = (
  uri: string,
  program: SparkProgram
): PublishDiagnosticsParams => {
  if (program.diagnostics) {
    const diagnostics = program.diagnostics[uri] || [];
    return { uri, diagnostics };
  }
  return { uri, diagnostics: [] };
};
