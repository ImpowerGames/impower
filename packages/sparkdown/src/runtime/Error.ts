export interface SourceMetadata {
  fileName: string | null;
  filePath: string | null;
  startLineNumber: number;
  endLineNumber: number;
  startCharacterNumber: number;
  endCharacterNumber: number;
}

export interface RaisedError {
  message: string;
  path: string | null;
  address?: number;
}

export type ErrorHandler = (
  message: string,
  type: ErrorType,
  source: SourceMetadata | null,
) => void;

export type RuntimeErrorHandler = (
  message: string,
  type: ErrorType,
  source: SourceMetadata | null,
  raised?: RaisedError | null,
) => void;

export enum ErrorType {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}
