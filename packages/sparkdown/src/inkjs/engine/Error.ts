// TODO: Unify with Compiler.

export interface SourceMetadata {
  fileName: string | null;
  filePath: string | null;
  startLineNumber: number;
  endLineNumber: number;
  startCharacterNumber: number;
  endCharacterNumber: number;
}

export type ErrorHandler = (
  message: string,
  type: ErrorType,
  source: SourceMetadata | null
) => void;

export enum ErrorType {
  Info,
  Warning,
  Error,
}
