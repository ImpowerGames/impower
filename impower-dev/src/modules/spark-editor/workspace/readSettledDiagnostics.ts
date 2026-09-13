import { DocumentDiagnosticMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DocumentDiagnosticMessage";
import type { DiagnosticsSettledParams, DiagnosticsSettledResult } from "@impower/spark-editor-protocol/src/protocols/textDocument/DiagnosticsSettledMessage";
import type { DocumentDiagnosticReport } from "@impower/spark-editor-protocol/src/types";

/** Pull after the server has compiled; never cache a first-paint/past revision. */
export async function readSettledDiagnostics(
  params: DiagnosticsSettledParams,
  request: (method: string, params: unknown) => Promise<DocumentDiagnosticReport>,
): Promise<DiagnosticsSettledResult> {
  const report = await request(DocumentDiagnosticMessage.method, { textDocument: params.textDocument });
  if (report.kind !== "full") throw new Error("Language server did not return a full diagnostic report");
  const version = report.resultId != null && Number.isFinite(Number(report.resultId)) ? Number(report.resultId) : null;
  if (params.version != null && (version == null || version < params.version)) {
    throw new Error(`Diagnostics have not reached document version ${params.version}`);
  }
  return { uri: params.textDocument.uri, version, diagnostics: report.items };
}
