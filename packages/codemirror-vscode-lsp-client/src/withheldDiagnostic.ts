import type * as lsp from "vscode-languageserver-protocol";

export const SPEAKER_PLACEHOLDER = "CHARACTER";

const WARNING: lsp.DiagnosticSeverity = 2;

const PLACEHOLDER_WARNING = `Cannot find character named \`${SPEAKER_PLACEHOLDER}\``;

export interface WithheldDiagnosticCandidate {
  range: lsp.Range;
  severity?: lsp.DiagnosticSeverity;
  message: string | lsp.MarkupContent;
}

const samePosition = (a: lsp.Position, b: lsp.Position) =>
  a.line === b.line && a.character === b.character;

export const isWithheldDiagnostic = (
  diagnostic: WithheldDiagnosticCandidate,
  withheld: lsp.Range | null | undefined,
): boolean =>
  withheld != null &&
  diagnostic.severity === WARNING &&
  (typeof diagnostic.message === "string"
    ? diagnostic.message
    : diagnostic.message.value) === PLACEHOLDER_WARNING &&
  samePosition(diagnostic.range.start, withheld.start) &&
  samePosition(diagnostic.range.end, withheld.end);
