export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

export interface CodeDescription {
  href: string;
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export type MarkupKind = "plaintext" | "markdown";

export interface MarkupContent {
  kind: MarkupKind;
  value: string;
}

export interface SparkDiagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  codeDescription?: CodeDescription;
  source?: string;
  message: string | MarkupContent;
  tags?: DiagnosticTag[];
  relatedInformation?: DiagnosticRelatedInformation[];
  data?: any;
}
