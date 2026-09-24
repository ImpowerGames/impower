// TODO: Unify with Compiler.

export interface SourceMetadata {
  fileName: string | null;
  filePath: string | null;
  startLineNumber: number;
  endLineNumber: number;
  startCharacterNumber: number;
  endCharacterNumber: number;
}

/** A runtime error as it was raised: its text without the location prefix the
 *  story's `message` carries, and the path of the content the story was
 *  executing, or null when it was executing none. */
export interface RaisedError {
  message: string;
  path: string | null;
}

export type ErrorHandler = (
  message: string,
  type: ErrorType,
  source: SourceMetadata | null,
) => void;

/** What a running story reports its errors and warnings through. */
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
