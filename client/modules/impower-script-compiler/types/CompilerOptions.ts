import { ErrorHandler } from "./ErrorHandler";

export interface CompilerOptions {
  sourceFilename: string;
  countAllVisits: boolean;
  errorHandler: ErrorHandler;
}
