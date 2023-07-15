import { URI } from "../lsp/languageserver-types";

/**
 * A workspace directory or file inside a client.
 */
export interface WorkspaceEntry {
  /**
   * The associated URI for this workspace entry.
   */
  uri: URI;
  /**
   * The name of the workspace entry. Used to refer to this
   * workspace entry in the user interface.
   */
  name: string;

  /**
   * The kind of entry.
   * (Either a directory or file)
   */
  kind: "directory" | "file";
}
