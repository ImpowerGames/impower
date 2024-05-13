import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { Diagnostic, PublishDiagnosticsParams } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

const getDocumentDiagnostics = (
  document: TextDocument,
  program: SparkProgram
): PublishDiagnosticsParams => {
  const result: Diagnostic[] = [];
  return { uri: document.uri, diagnostics: result };
  // TODO:
  // const diagnostics = program?.diagnostics;
  // if (!document || !diagnostics) {
  //   return { uri: document.uri, diagnostics: result };
  // }
  // diagnostics.forEach((d) => {
  //   const start = document.positionAt(d.from);
  //   const end = document.positionAt(d.to);
  //   if (
  //     start.line >= 0 &&
  //     start.line < document.lineCount &&
  //     end.line >= 0 &&
  //     end.line < document.lineCount
  //   ) {
  //     const diagnostic: Diagnostic = {
  //       severity:
  //         d.severity === "error"
  //           ? DiagnosticSeverity.Error
  //           : d.severity === "warning"
  //           ? DiagnosticSeverity.Warning
  //           : DiagnosticSeverity.Information,
  //       range: {
  //         start,
  //         end,
  //       },
  //       message: d.message,
  //       source: "sparkdown",
  //       data: d.actions,
  //     };
  //     result.push(diagnostic);
  //   }
  // });
  // return { uri: document.uri, version: document.version, diagnostics: result };
};

export default getDocumentDiagnostics;
