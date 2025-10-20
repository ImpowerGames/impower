import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { type PublishDiagnosticsParams } from "vscode-languageserver";

export const getDocumentDiagnostics = (
  uri: string,
  program: SparkProgram | undefined,
  version: number | undefined
): PublishDiagnosticsParams => {
  if (program?.diagnostics) {
    const diagnostics = program.diagnostics[uri] || [];
    return { uri, diagnostics, version };
  }
  return { uri, diagnostics: [], version };
};
