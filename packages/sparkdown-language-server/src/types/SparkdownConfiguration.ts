import { SparkdownCompilerConfig } from "@impower/sparkdown/src/types/SparkdownCompilerConfig";

export interface SparkdownConfiguration extends SparkdownCompilerConfig {
  editor?: { autoRenameFiles?: boolean };
}
