import { SparkdownCompilerConfig } from "@impower/sparkdown/src/types/SparkdownCompilerConfig";

export interface SparkdownConfiguration extends SparkdownCompilerConfig {
  formatter?: { convertInkSyntaxToSparkdownSyntax?: boolean };
  editor?: { autoRenameFiles?: boolean };
}
