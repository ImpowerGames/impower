import { CompilerDiagnostic } from "./compilerDiagnostic";
import { CompilerReference } from "./compilerReference";

export type Formatter = (
  str: string,
  context?: Record<string, unknown>
) => [string, CompilerDiagnostic[], CompilerReference[]];
