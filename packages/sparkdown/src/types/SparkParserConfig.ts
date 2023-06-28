import { CompilerDiagnostic } from "./CompilerDiagnostic";
import { SparkDeclarations } from "./SparkDeclarations";
import { SparkParserContext } from "./SparkParserContext";
import { SparkTokenType } from "./SparkTokenType";

interface SparkAugmentations extends SparkDeclarations {
  scopes?: string[];
}

export interface SparkParserConfig {
  augmentations?: SparkAugmentations;
  lineOffset?: number;
  removeBlockComments?: boolean;
  skipTokens?: SparkTokenType[];
  compiler?: (
    expr: string,
    context?: Record<string, unknown>
  ) => [unknown, CompilerDiagnostic[], CompilerDiagnostic[]];
  formatter?: (
    str: string,
    context?: Record<string, unknown>
  ) => [string, CompilerDiagnostic[], CompilerDiagnostic[]];
  extensions?: ((context: SparkParserContext) =>
    | {
        type: string;
        content?: string;
      }
    | undefined)[];
}
