import { CompilerDiagnostic } from "./CompilerDiagnostic";
import { CompilerReference } from "./CompilerReference";
import { SparkDeclarations } from "./SparkDeclarations";
import { SparkTokenType } from "./SparkTokenType";

export interface SparkParserConfig {
  augmentations?: SparkDeclarations;
  lineOffset?: number;
  removeBlockComments?: boolean;
  skipTokens?: SparkTokenType[];
  compiler?: (
    expr: string,
    context?: Record<string, unknown>
  ) => [unknown, CompilerDiagnostic[], CompilerReference[]];
  formatter?: (
    str: string,
    context?: Record<string, unknown>
  ) => [string, CompilerDiagnostic[], CompilerReference[]];
}
