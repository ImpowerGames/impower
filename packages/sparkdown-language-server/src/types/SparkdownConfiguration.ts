import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";

export interface SparkdownConfiguration extends SparkdownCompilerConfig {
  formatter?: { convertInkSyntaxToSparkdownSyntax?: boolean };
  editor?: { autoRenameFiles?: boolean };
}
