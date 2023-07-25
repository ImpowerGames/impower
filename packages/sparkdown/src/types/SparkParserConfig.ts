import { CompilerDiagnostic } from "./CompilerDiagnostic";
import { SparkParserContext } from "./SparkParserContext";
import { SparkProgram } from "./SparkProgram";
import { SparkTokenType } from "./SparkTokenType";

interface SparkAugmentations extends Partial<SparkProgram> {}

export interface SparkParserConfig {
  augmentations?: SparkAugmentations;
  lineOffset?: number;
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
