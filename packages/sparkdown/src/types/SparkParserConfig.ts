import { CompilerDiagnostic } from "./CompilerDiagnostic";
import { SparkParserContext } from "./SparkParserContext";
import { SparkProgram } from "./SparkProgram";
import { SparkTokenTag } from "./SparkTokenTag";

interface SparkAugmentations extends Partial<SparkProgram> {}

export interface SparkParserConfig {
  augmentations?: SparkAugmentations;
  skipTokens?: SparkTokenTag[];
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
