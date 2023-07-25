import { URI } from "../lsp/languageserver-types";

/**
 * A workspace directory or file inside a client.
 */
export interface WorkspaceEntry {
  /**
   * The associated URI for this workspace entry.
   */
  uri: URI;
}
