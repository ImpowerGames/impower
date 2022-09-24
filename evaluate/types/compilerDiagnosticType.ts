export type CompilerDiagnosticType =
  | "variable-not-found"
  | "unknown-operation"
  | "unsupported-operation"
  | "reserved-keyword"
  | "parse-error"
  | "unknown-token"
  | "invalid-formatter-arguments";
