import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type BuildFilesMethod = typeof BuildFilesMessage.method;

export interface BuildFilesParams {
  /**
   * The files that should be bundled and compiled.
   */
  files: {
    /**
     * The uri of the file.
     */
    uri: string;
  }[];
}

export interface BuildFilesResult {
  programs: { uri: string; name: string; program: SparkProgram }[];
}

export namespace BuildFilesMessage {
  export const method = "workspace/buildFiles";
  export const type = new MessageProtocolRequestType<
    BuildFilesMethod,
    BuildFilesParams,
    BuildFilesResult
  >(BuildFilesMessage.method);
}
