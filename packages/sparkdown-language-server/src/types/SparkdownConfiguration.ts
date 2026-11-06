import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";

export interface SparkdownConfiguration extends SparkdownCompilerConfig {
  editor?: { autoRenameFiles?: boolean };
}
