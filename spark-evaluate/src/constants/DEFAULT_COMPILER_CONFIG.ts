import { CompilerDiagnostic } from "../types/CompilerDiagnostic";
import { CompilerReference } from "../types/CompilerReference";
import { format } from "../utils/format";

export type Formatter = (
  str: string,
  context?: Record<string, unknown>
) => [string, CompilerDiagnostic[], CompilerReference[]];

export const DEFAULT_COMPILER_CONFIG: {
  formatter?: Formatter;
} = {
  formatter: format,
};
