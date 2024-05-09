import type { CompilerDiagnostic } from "./CompilerDiagnostic";
import type { SparkParserContext } from "./SparkParserContext";

export interface SparkParserConfig {
  builtins?: {
    [type: string]: {
      [name: string]: any;
    };
  };
  files?: {
    [type: string]: {
      [name: string]: {
        ext: string;
        src: string;
        text?: string;
      };
    };
  };
  main?: string;
  extensions?: ((ctx: SparkParserContext) =>
    | {
        type: string;
        content?: string;
      }
    | undefined)[];
  compiler?: (
    expr: string,
    context?: Record<string, unknown>
  ) => [unknown, CompilerDiagnostic[], CompilerDiagnostic[]];
  formatter?: (
    expr: string,
    context?: Record<string, unknown>
  ) => [string, CompilerDiagnostic[], CompilerDiagnostic[]];
}
