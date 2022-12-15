import { CompilerDiagnostic } from "./CompilerDiagnostic";
import { CompilerReference } from "./CompilerReference";

export type Formatter = (
  str: string,
  context?: Record<string, unknown>
) => [string, CompilerDiagnostic[], CompilerReference[]];
