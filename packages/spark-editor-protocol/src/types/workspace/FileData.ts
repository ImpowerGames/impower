import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";

/**
 * A workspace directory or file inside a client.
 */
export interface FileData {
  uri: string;
  name: string;
  src: string;
  ext: string;
  type: string;
  version: number;
  text?: string;
  program?: SparkProgram;
}
